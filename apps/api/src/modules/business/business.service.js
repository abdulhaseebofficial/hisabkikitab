/**
 * Business Domain Service.
 * Implements end-to-end business workflows and enforces financial integrity.
 */

const { getPool } = require('../../infrastructure/database/pool');
const BusinessRepository = require('./business.repository');
const AccountingEngine = require('./accounting.engine');
const { runBusinessIdempotent } = require('./business.idempotency');
const requests = require('../../shared/finance/idempotency');
const ApiError = require('../../shared/errors/ApiError');

const BusinessService = {
  // ---------------------------------------------------------------------------
  // Business Onboarding & Settings
  // ---------------------------------------------------------------------------

  async createBusiness(userId, payload) {
    const userRes = await getPool().query('SELECT is_demo FROM users WHERE id = $1', [userId]);
    if (userRes.rows[0]?.is_demo) {
      throw ApiError.forbidden('Demo Mode is read-only');
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      const { business, branch } = await BusinessRepository.createBusiness(client, {
        ownerId: userId,
        name: payload.name,
        category: payload.category,
        businessType: payload.businessType,
        description: payload.description,
        currency: payload.currency || 'PKR',
        contactNumber: payload.contactNumber,
        email: payload.email,
        address: payload.address,
        city: payload.city,
        country: payload.country || 'PK',
        taxId: payload.taxId,
      });

      // Opening balances support if specified
      const opening = payload.openingBalances || {};
      const cashMinor = BigInt(opening.cashMinor || 0);
      const bankMinor = BigInt(opening.bankMinor || 0);
      const inventoryMinor = BigInt(opening.inventoryMinor || 0);
      const receivablesMinor = BigInt(opening.receivablesMinor || 0);
      const payablesMinor = BigInt(opening.payablesMinor || 0);

      const totalDebits = cashMinor + bankMinor + inventoryMinor + receivablesMinor;
      const totalCredits = payablesMinor;

      if (totalDebits > 0n || totalCredits > 0n) {
        // Find system accounts
        const cashAcc = await BusinessRepository.getAccountByCode(client, business.id, '1010');
        const bankAcc = await BusinessRepository.getAccountByCode(client, business.id, '1020');
        const invAcc = await BusinessRepository.getAccountByCode(client, business.id, '1200');
        const recAcc = await BusinessRepository.getAccountByCode(client, business.id, '1100');
        const payAcc = await BusinessRepository.getAccountByCode(client, business.id, '2010');
        const capAcc = await BusinessRepository.getAccountByCode(client, business.id, '3010');

        const lines = [];
        if (cashMinor > 0n) lines.push({ accountId: cashAcc.id, debitMinor: cashMinor.toString(), creditMinor: 0, description: 'Opening Cash Balance' });
        if (bankMinor > 0n) lines.push({ accountId: bankAcc.id, debitMinor: bankMinor.toString(), creditMinor: 0, description: 'Opening Bank Balance' });
        if (inventoryMinor > 0n) lines.push({ accountId: invAcc.id, debitMinor: inventoryMinor.toString(), creditMinor: 0, description: 'Opening Inventory Valuation' });
        if (receivablesMinor > 0n) lines.push({ accountId: recAcc.id, debitMinor: receivablesMinor.toString(), creditMinor: 0, description: 'Opening Accounts Receivable' });
        if (payablesMinor > 0n) lines.push({ accountId: payAcc.id, debitMinor: 0, creditMinor: payablesMinor.toString(), description: 'Opening Accounts Payable' });

        // Net Owner Capital balances the entry: Capital = Assets - Liabilities
        const netCapital = totalDebits - totalCredits;
        if (netCapital > 0n) {
          lines.push({ accountId: capAcc.id, debitMinor: 0, creditMinor: netCapital.toString(), description: 'Opening Owner Capital' });
        } else if (netCapital < 0n) {
          lines.push({ accountId: capAcc.id, debitMinor: (-netCapital).toString(), creditMinor: 0, description: 'Opening Capital Deficit' });
        }

        if (lines.length >= 2) {
          const today = new Date().toISOString().split('T')[0];
          await AccountingEngine.postJournalEntry(client, {
            businessId: business.id,
            branchId: branch.id,
            entryNumber: 'OPEN-001',
            date: today,
            entryType: 'opening',
            referenceType: 'onboarding',
            narration: 'Opening balance sheet reconciliation',
            lines,
            userId,
          });
        }
      }

      await BusinessRepository.logAction(business.id, userId, 'create_business', 'businesses', business.id, { name: business.name });
      await client.query('COMMIT');
      return business;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async createBusinessIdempotent(userId, idempotencyKey, payload) {
    return requests.run(userId, 'business:create', idempotencyKey, payload, async () => {
      return this.createBusiness(userId, payload);
    });
  },

  async listUserBusinesses(userId) {
    return BusinessRepository.listUserBusinesses(userId);
  },

  async getBusiness(businessId) {
    return BusinessRepository.getBusinessById(businessId);
  },

  async updateBusiness(businessId, userId, payload) {
    const { settings, ...updates } = payload;
    await BusinessRepository.updateBusiness(businessId, updates, settings);
    await BusinessRepository.logAction(businessId, userId, 'update_business', 'businesses', businessId, payload);
    return BusinessRepository.getBusinessById(businessId);
  },

  // ---------------------------------------------------------------------------
  // Products & Inventory
  // ---------------------------------------------------------------------------

  async listProducts(businessId, query) {
    return BusinessRepository.listProducts(businessId, query);
  },

  async createProduct(businessId, userId, payload) {
    const product = await BusinessRepository.createProduct(businessId, payload);
    await BusinessRepository.logAction(businessId, userId, 'create_product', 'biz_products', product.id, { name: product.name });
    return product;
  },

  async updateProduct(businessId, productId, userId, updates) {
    const product = await BusinessRepository.updateProduct(businessId, productId, updates);
    await BusinessRepository.logAction(businessId, userId, 'update_product', 'biz_products', productId, updates);
    return product;
  },

  async listCategories(businessId) {
    return BusinessRepository.listCategories(businessId);
  },

  async createCategory(businessId, userId, { name, description }) {
    const cat = await BusinessRepository.createCategory(businessId, name, description);
    await BusinessRepository.logAction(businessId, userId, 'create_category', 'biz_product_categories', cat.id, { name });
    return cat;
  },

  async adjustStock(businessId, userId, { productId, adjustedQuantity, reason, type = 'adjustment_add' }, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');
      const product = await BusinessRepository.getProductById(client, businessId, productId);
      if (!product) throw new Error('Product not found');

      const qty = Number(adjustedQuantity);
      if (qty <= 0) throw new Error('Adjusted quantity must be greater than zero');

      const unitCost = BigInt(product.purchase_price_minor || 0);
      const totalCost = unitCost * BigInt(Math.round(qty));

      let newStock = Number(product.current_stock);
      if (type === 'adjustment_add') {
        newStock += qty;
      } else {
        newStock = Math.max(0, newStock - qty);
      }

      const newValuation = unitCost * BigInt(Math.max(0, Math.round(newStock)));

      await client.query(
        `UPDATE biz_products
         SET current_stock = $1, inventory_valuation_minor = $2, updated_at = now()
         WHERE id = $3 AND business_id = $4`,
        [newStock, newValuation.toString(), productId, businessId]
      );

      await client.query(
        `INSERT INTO biz_stock_movements (
          business_id, product_id, movement_type, quantity, unit_cost_minor,
          total_cost_minor, reference_type, reason
        ) VALUES ($1, $2, $3, $4, $5, $6, 'stock_adjustment', $7)`,
        [businessId, productId, type, qty, unitCost.toString(), totalCost.toString(), reason || 'Manual adjustment']
      );

      // Journal entry for inventory adjustment
      const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');
      const cogsAcc = await BusinessRepository.getAccountByCode(client, businessId, '5010');

      if (totalCost > 0n && invAcc && cogsAcc) {
        const today = new Date().toISOString().split('T')[0];
        const lines = type === 'adjustment_add'
          ? [
              { accountId: invAcc.id, debitMinor: totalCost.toString(), creditMinor: 0, description: 'Stock surplus added' },
              { accountId: cogsAcc.id, debitMinor: 0, creditMinor: totalCost.toString(), description: 'Inventory adjustment credit' },
            ]
          : [
              { accountId: cogsAcc.id, debitMinor: totalCost.toString(), creditMinor: 0, description: 'Stock damage/loss expense' },
              { accountId: invAcc.id, debitMinor: 0, creditMinor: totalCost.toString(), description: 'Inventory reduction' },
            ];

        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: `ADJ-${Date.now().toString().slice(-6)}`,
          date: today,
          entryType: 'adjustment',
          referenceType: 'stock_adjustment',
          referenceId: productId,
          narration: `Stock adjustment for ${product.name}: ${reason}`,
          lines,
          userId,
        });
      }

      if (managesTransaction) await client.query('COMMIT');
      return { success: true, newStock };
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async adjustStockIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'adjust_stock',
      key: idempotencyKey,
      payload,
      perform: (client) => this.adjustStock(businessId, userId, payload, client),
    });
  },

  // ---------------------------------------------------------------------------
  // Customers & Khata
  // ---------------------------------------------------------------------------

  async listCustomers(businessId, search) {
    return BusinessRepository.listCustomers(businessId, search);
  },

  async getCustomer(businessId, customerId) {
    const customer = await BusinessRepository.getCustomerById(businessId, customerId);
    if (!customer) return null;
    customer.ledger = await BusinessRepository.getCustomerLedger(businessId, customerId);
    return customer;
  },

  async createCustomer(businessId, userId, payload) {
    const customer = await BusinessRepository.createCustomer(businessId, payload);
    await BusinessRepository.logAction(businessId, userId, 'create_customer', 'biz_customers', customer.id, { name: customer.name });
    return customer;
  },

  // ---------------------------------------------------------------------------
  // Suppliers & Khata
  // ---------------------------------------------------------------------------

  async listSuppliers(businessId, search) {
    return BusinessRepository.listSuppliers(businessId, search);
  },

  async getSupplier(businessId, supplierId) {
    const supplier = await BusinessRepository.getSupplierById(businessId, supplierId);
    if (!supplier) return null;
    supplier.ledger = await BusinessRepository.getSupplierLedger(businessId, supplierId);
    return supplier;
  },

  async createSupplier(businessId, userId, payload) {
    const supplier = await BusinessRepository.createSupplier(businessId, payload);
    await BusinessRepository.logAction(businessId, userId, 'create_supplier', 'biz_suppliers', supplier.id, { name: supplier.name });
    return supplier;
  },

  // ---------------------------------------------------------------------------
  // Sales & POS Workflows
  // ---------------------------------------------------------------------------

  async createSale(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      // 1. Generate Invoice Number
      const settingsRes = await client.query(
        `SELECT invoice_prefix, invoice_next_number FROM business_settings WHERE business_id = $1 FOR UPDATE`,
        [businessId]
      );
      const settings = settingsRes.rows[0] || { invoice_prefix: 'INV-', invoice_next_number: 1 };
      const saleNumber = `${settings.invoice_prefix}${String(settings.invoice_next_number).padStart(5, '0')}`;

      await client.query(
        `UPDATE business_settings SET invoice_next_number = invoice_next_number + 1 WHERE business_id = $1`,
        [businessId]
      );

      const items = payload.items || [];
      if (!items.length) throw new Error('Sale must contain at least one item');

      let subtotal = 0n;
      let totalCost = 0n;
      const verifiedItems = [];

      // 2. Validate Items, Calculate Pricing & Update Stock
      for (const item of items) {
        const prodRes = await client.query(
          `SELECT * FROM biz_products WHERE id = $1 AND business_id = $2 FOR UPDATE`,
          [item.productId, businessId]
        );
        if (!prodRes.rows.length) throw new Error(`Product ${item.productId} not found`);
        const product = prodRes.rows[0];

        const qty = Number(item.quantity || 1);
        if (qty <= 0) throw new Error('Quantity must be greater than zero');

        const unitPrice = BigInt(item.unitPriceMinor !== undefined ? item.unitPriceMinor : product.selling_price_minor);
        const unitCost = BigInt(product.purchase_price_minor || 0);
        const discount = BigInt(item.discountMinor || 0);
        const tax = BigInt(item.taxMinor || 0);
        const lineTotal = (unitPrice * BigInt(Math.round(qty))) - discount + tax;

        subtotal += lineTotal;
        const lineCost = unitCost * BigInt(Math.round(qty));
        totalCost += lineCost;

        // Reduce inventory
        const newStock = Math.max(0, Number(product.current_stock) - qty);
        const newValuation = unitCost * BigInt(Math.max(0, Math.round(newStock)));

        await client.query(
          `UPDATE biz_products
           SET current_stock = $1, inventory_valuation_minor = $2, updated_at = now()
           WHERE id = $3 AND business_id = $4`,
          [newStock, newValuation.toString(), product.id, businessId]
        );

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPriceMinor: unitPrice.toString(),
          unitCostMinor: unitCost.toString(),
          discountMinor: discount.toString(),
          taxMinor: tax.toString(),
          lineTotalMinor: lineTotal.toString(),
        });
      }

      const invoiceDiscount = BigInt(payload.discountMinor || 0);
      const invoiceTax = BigInt(payload.taxMinor || 0);
      const grandTotal = subtotal - invoiceDiscount + invoiceTax;

      const paymentMethod = payload.paymentMethod || 'cash';
      let amountPaid = BigInt(payload.amountPaidMinor !== undefined ? payload.amountPaidMinor : (paymentMethod === 'credit' ? 0 : grandTotal));
      if (amountPaid > grandTotal) amountPaid = grandTotal;
      const balanceDue = grandTotal - amountPaid;

      // Determine receiving account
      let paymentAccountId = payload.paymentAccountId;
      if (!paymentAccountId && amountPaid > 0n) {
        const subtype = paymentMethod === 'bank' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash';
        const acc = await BusinessRepository.getAccountBySubtype(client, businessId, subtype);
        if (acc) paymentAccountId = acc.id;
      }

      const saleDate = payload.date || new Date().toISOString().split('T')[0];

      // 3. Insert Sale Header
      const saleRes = await client.query(
        `INSERT INTO biz_sales (
          business_id, sale_number, customer_id, date, subtotal_minor,
          discount_minor, tax_minor, total_amount_minor, amount_paid_minor,
          balance_due_minor, payment_method, payment_account_id, is_pos, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          businessId, saleNumber, payload.customerId || null, saleDate,
          subtotal.toString(), invoiceDiscount.toString(), invoiceTax.toString(),
          grandTotal.toString(), amountPaid.toString(), balanceDue.toString(),
          paymentMethod, paymentAccountId || null, Boolean(payload.isPos), payload.notes || '', userId
        ]
      );
      const sale = saleRes.rows[0];

      // 4. Insert Items & Stock Movements
      for (const item of verifiedItems) {
        await client.query(
          `INSERT INTO biz_sale_items (
            sale_id, product_id, product_name, quantity, unit_price_minor,
            unit_cost_minor, discount_minor, tax_minor, line_total_minor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [sale.id, item.productId, item.productName, item.quantity, item.unitPriceMinor, item.unitCostMinor, item.discountMinor, item.taxMinor, item.lineTotalMinor]
        );

        await client.query(
          `INSERT INTO biz_stock_movements (
            business_id, product_id, movement_type, quantity, unit_cost_minor,
            total_cost_minor, reference_type, reference_id, reason
          ) VALUES ($1, $2, 'sale', $3, $4, $5, 'sale', $6, $7)`,
          [businessId, item.productId, item.quantity, item.unitCostMinor, (BigInt(item.unitCostMinor) * BigInt(Math.round(item.quantity))).toString(), sale.id, `Sale #${saleNumber}`]
        );
      }

      // 5. Update Customer Khata balance if credit or partial payment
      if (payload.customerId && balanceDue > 0n) {
        await client.query(
          `UPDATE biz_customers
           SET current_balance_minor = current_balance_minor + $1, updated_at = now()
           WHERE id = $2 AND business_id = $3`,
          [balanceDue.toString(), payload.customerId, businessId]
        );
      }

      // 6. Double-Entry Accounting Posting
      const revAcc = await BusinessRepository.getAccountByCode(client, businessId, '4010');
      const recAcc = await BusinessRepository.getAccountByCode(client, businessId, '1100');
      const taxAcc = await BusinessRepository.getAccountByCode(client, businessId, '2050');
      const cogsAcc = await BusinessRepository.getAccountByCode(client, businessId, '5010');
      const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');

      const journalLines = [];

      // Debits: Cash/Bank received + Receivables outstanding
      if (amountPaid > 0n && paymentAccountId) {
        journalLines.push({ accountId: paymentAccountId, debitMinor: amountPaid.toString(), creditMinor: 0, description: `Cash/bank received for sale #${saleNumber}` });
      }
      if (balanceDue > 0n && recAcc) {
        journalLines.push({ accountId: recAcc.id, debitMinor: balanceDue.toString(), creditMinor: 0, description: `Receivable from customer for sale #${saleNumber}` });
      }

      // Credits: Sales Revenue + Tax Liability
      const netRevenue = grandTotal - invoiceTax;
      if (netRevenue > 0n && revAcc) {
        journalLines.push({ accountId: revAcc.id, debitMinor: 0, creditMinor: netRevenue.toString(), description: `Revenue from sale #${saleNumber}` });
      }
      if (invoiceTax > 0n && taxAcc) {
        journalLines.push({ accountId: taxAcc.id, debitMinor: 0, creditMinor: invoiceTax.toString(), description: `Sales tax collected for sale #${saleNumber}` });
      }

      // Inventory COGS entry
      if (totalCost > 0n && cogsAcc && invAcc) {
        journalLines.push({ accountId: cogsAcc.id, debitMinor: totalCost.toString(), creditMinor: 0, description: `Cost of goods sold for sale #${saleNumber}` });
        journalLines.push({ accountId: invAcc.id, debitMinor: 0, creditMinor: totalCost.toString(), description: `Inventory reduction for sale #${saleNumber}` });
      }

      if (journalLines.length >= 2) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: saleNumber,
          date: saleDate,
          entryType: 'sale',
          referenceType: 'sale',
          referenceId: sale.id,
          narration: `Sale #${saleNumber} to ${payload.customerId ? 'Customer' : 'Walk-in'}`,
          lines: journalLines,
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_sale', 'biz_sales', sale.id, { saleNumber, total: grandTotal.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return sale;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createSaleIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sale',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createSale(businessId, userId, payload, client),
    });
  },

  async listSales(businessId, query) {
    return BusinessRepository.listSales(businessId, query);
  },

  async getSale(businessId, saleId) {
    return BusinessRepository.getSaleById(businessId, saleId);
  },

  // ---------------------------------------------------------------------------
  // Purchases & Procurement
  // ---------------------------------------------------------------------------

  async createPurchase(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const purchaseNumber = `PUR-${Date.now().toString().slice(-6)}`;
      const items = payload.items || [];
      if (!items.length) throw new Error('Purchase must contain at least one item');

      let grandTotal = 0n;
      const verifiedItems = [];

      // 1. Process items, calculate totals, and update product stock + weighted average cost
      for (const item of items) {
        const prodRes = await client.query(
          `SELECT * FROM biz_products WHERE id = $1 AND business_id = $2 FOR UPDATE`,
          [item.productId, businessId]
        );
        if (!prodRes.rows.length) throw new Error(`Product ${item.productId} not found`);
        const product = prodRes.rows[0];

        const qty = Number(item.quantity || 1);
        if (qty <= 0) throw new Error('Quantity must be greater than zero');

        const unitPrice = BigInt(item.unitPriceMinor);
        const lineTotal = unitPrice * BigInt(Math.round(qty));
        grandTotal += lineTotal;

        // Weighted Average Costing calculation
        const oldStock = Number(product.current_stock);
        const oldValuation = BigInt(product.inventory_valuation_minor || 0);
        const newStock = oldStock + qty;
        const newValuation = oldValuation + lineTotal;
        const newUnitCost = newStock > 0 ? (newValuation / BigInt(Math.round(newStock))) : unitPrice;

        await client.query(
          `UPDATE biz_products
           SET current_stock = $1, purchase_price_minor = $2, inventory_valuation_minor = $3, updated_at = now()
           WHERE id = $4 AND business_id = $5`,
          [newStock, newUnitCost.toString(), newValuation.toString(), product.id, businessId]
        );

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPriceMinor: unitPrice.toString(),
          lineTotalMinor: lineTotal.toString(),
        });
      }

      const paymentMethod = payload.paymentMethod || 'cash';
      let amountPaid = BigInt(payload.amountPaidMinor !== undefined ? payload.amountPaidMinor : (paymentMethod === 'credit' ? 0 : grandTotal));
      if (amountPaid > grandTotal) amountPaid = grandTotal;
      const balanceDue = grandTotal - amountPaid;

      let paymentAccountId = payload.paymentAccountId;
      if (!paymentAccountId && amountPaid > 0n) {
        const subtype = paymentMethod === 'bank' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash';
        const acc = await BusinessRepository.getAccountBySubtype(client, businessId, subtype);
        if (acc) paymentAccountId = acc.id;
      }

      const purchaseDate = payload.date || new Date().toISOString().split('T')[0];

      // 2. Insert Purchase Record
      const purRes = await client.query(
        `INSERT INTO biz_purchases (
          business_id, purchase_number, supplier_id, date, total_amount_minor,
          amount_paid_minor, balance_due_minor, payment_method, payment_account_id,
          status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, $11)
        RETURNING *`,
        [businessId, purchaseNumber, payload.supplierId || null, purchaseDate, grandTotal.toString(), amountPaid.toString(), balanceDue.toString(), paymentMethod, paymentAccountId || null, payload.notes || '', userId]
      );
      const purchase = purRes.rows[0];

      // 3. Insert Items and Stock Movements
      for (const item of verifiedItems) {
        await client.query(
          `INSERT INTO biz_purchase_items (
            purchase_id, product_id, product_name, quantity, unit_price_minor, line_total_minor
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [purchase.id, item.productId, item.productName, item.quantity, item.unitPriceMinor, item.lineTotalMinor]
        );

        await client.query(
          `INSERT INTO biz_stock_movements (
            business_id, product_id, movement_type, quantity, unit_cost_minor,
            total_cost_minor, reference_type, reference_id, reason
          ) VALUES ($1, $2, 'purchase', $3, $4, $5, 'purchase', $6, $7)`,
          [businessId, item.productId, item.quantity, item.unitPriceMinor, item.lineTotalMinor, purchase.id, `Purchase #${purchaseNumber}`]
        );
      }

      // 4. Update Supplier Khata balance if credit or partial payment
      if (payload.supplierId && balanceDue > 0n) {
        await client.query(
          `UPDATE biz_suppliers
           SET current_balance_minor = current_balance_minor + $1, updated_at = now()
           WHERE id = $2 AND business_id = $3`,
          [balanceDue.toString(), payload.supplierId, businessId]
        );
      }

      // 5. Double-Entry Accounting Posting
      const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');
      const payAcc = await BusinessRepository.getAccountByCode(client, businessId, '2010');

      const journalLines = [];
      // Debit: Inventory Asset
      if (grandTotal > 0n && invAcc) {
        journalLines.push({ accountId: invAcc.id, debitMinor: grandTotal.toString(), creditMinor: 0, description: `Inventory purchased on #${purchaseNumber}` });
      }
      // Credits: Cash/Bank paid + Accounts Payable
      if (amountPaid > 0n && paymentAccountId) {
        journalLines.push({ accountId: paymentAccountId, debitMinor: 0, creditMinor: amountPaid.toString(), description: `Paid for purchase #${purchaseNumber}` });
      }
      if (balanceDue > 0n && payAcc) {
        journalLines.push({ accountId: payAcc.id, debitMinor: 0, creditMinor: balanceDue.toString(), description: `Payable to supplier for purchase #${purchaseNumber}` });
      }

      if (journalLines.length >= 2) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: purchaseNumber,
          date: purchaseDate,
          entryType: 'purchase',
          referenceType: 'purchase',
          referenceId: purchase.id,
          narration: `Purchase #${purchaseNumber} from ${payload.supplierId ? 'Supplier' : 'Market'}`,
          lines: journalLines,
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_purchase', 'biz_purchases', purchase.id, { purchaseNumber, total: grandTotal.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return purchase;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createPurchaseIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_purchase',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createPurchase(businessId, userId, payload, client),
    });
  },

  async listPurchases(businessId, query) {
    return BusinessRepository.listPurchases(businessId, query);
  },

  async getPurchase(businessId, purchaseId) {
    return BusinessRepository.getPurchaseById(businessId, purchaseId);
  },

  // ---------------------------------------------------------------------------
  // Operating Expenses
  // ---------------------------------------------------------------------------

  async createExpense(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const amountMinor = BigInt(payload.amountMinor || 0);
      if (amountMinor <= 0n) throw new Error('Expense amount must be greater than zero');

      // Find or assign category expense account
      let categoryAcc = null;
      if (payload.categoryAccountId) {
        const { rows } = await client.query('SELECT * FROM biz_accounts WHERE id = $1 AND business_id = $2', [payload.categoryAccountId, businessId]);
        categoryAcc = rows[0];
      }
      if (!categoryAcc) {
        categoryAcc = await BusinessRepository.getAccountByCode(client, businessId, '6990');
      }

      const paymentMethod = payload.paymentMethod || 'cash';
      const isUnpaid = paymentMethod === 'unpaid';
      const paidAmountMinor = isUnpaid ? 0n : amountMinor;
      const status = isUnpaid ? 'unpaid' : 'paid';

      let paymentAccountId = payload.paymentAccountId;
      if (!isUnpaid && !paymentAccountId) {
        const subtype = paymentMethod === 'bank' ? 'bank' : paymentMethod === 'wallet' ? 'wallet' : 'cash';
        const acc = await BusinessRepository.getAccountBySubtype(client, businessId, subtype);
        if (acc) paymentAccountId = acc.id;
      }

      const expenseDate = payload.date || new Date().toISOString().split('T')[0];

      const expRes = await client.query(
        `INSERT INTO biz_expenses (
          business_id, category_account_id, title, category, amount_minor,
          date, payment_method, payment_account_id, paid_amount_minor, status,
          vendor, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [businessId, categoryAcc.id, payload.title, payload.category || 'General', amountMinor.toString(), expenseDate, paymentMethod, paymentAccountId || null, paidAmountMinor.toString(), status, payload.vendor || '', payload.notes || '', userId]
      );
      const expense = expRes.rows[0];

      // Accounting Journal Entry: Debit Expense Account, Credit Cash/Bank or Unpaid Bills Liability
      const unpaidBillAcc = await BusinessRepository.getAccountByCode(client, businessId, '2020');
      const creditAccountId = isUnpaid ? unpaidBillAcc.id : paymentAccountId;

      if (creditAccountId) {
        const lines = [
          { accountId: categoryAcc.id, debitMinor: amountMinor.toString(), creditMinor: 0, description: `Expense: ${payload.title}` },
          { accountId: creditAccountId, debitMinor: 0, creditMinor: amountMinor.toString(), description: isUnpaid ? `Unpaid bill liability: ${payload.title}` : `Paid for ${payload.title}` },
        ];

        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: `EXP-${Date.now().toString().slice(-6)}`,
          date: expenseDate,
          entryType: 'expense',
          referenceType: 'expense',
          referenceId: expense.id,
          narration: `Business expense: ${payload.title} (${payload.category})`,
          lines,
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_expense', 'biz_expenses', expense.id, { title: payload.title, amount: amountMinor.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return expense;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createExpenseIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_expense',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createExpense(businessId, userId, payload, client),
    });
  },

  async listExpenses(businessId, query) {
    return BusinessRepository.listExpenses(businessId, query);
  },

  // ---------------------------------------------------------------------------
  // Business Payments (Khata Settlements, Transfers, Owner Equity)
  // ---------------------------------------------------------------------------

  async createPayment(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const amountMinor = BigInt(payload.amountMinor || 0);
      if (amountMinor <= 0n) throw new Error('Payment amount must be greater than zero');

      const paymentType = payload.paymentType;
      const paymentDate = payload.date || new Date().toISOString().split('T')[0];

      let fromAccountId = payload.fromAccountId;
      let toAccountId = payload.toAccountId;

      const journalLines = [];

      if (paymentType === 'customer_payment') {
        // Customer pays money to business (reduces receivable)
        if (!payload.customerId) throw new Error('Customer ID is required for customer payment');
        const recAcc = await BusinessRepository.getAccountByCode(client, businessId, '1100');
        if (!toAccountId) {
          const cashAcc = await BusinessRepository.getAccountByCode(client, businessId, '1010');
          toAccountId = cashAcc.id;
        }

        // Debit cash/bank, Credit Accounts Receivable
        journalLines.push({ accountId: toAccountId, debitMinor: amountMinor.toString(), creditMinor: 0, description: 'Customer khata payment received' });
        journalLines.push({ accountId: recAcc.id, debitMinor: 0, creditMinor: amountMinor.toString(), description: 'Reduction in customer receivable' });

        // Update customer balance
        await client.query(
          `UPDATE biz_customers SET current_balance_minor = current_balance_minor - $1, updated_at = now() WHERE id = $2 AND business_id = $3`,
          [amountMinor.toString(), payload.customerId, businessId]
        );
      } else if (paymentType === 'supplier_payment') {
        // Business pays supplier (reduces payable)
        if (!payload.supplierId) throw new Error('Supplier ID is required for supplier payment');
        const payAcc = await BusinessRepository.getAccountByCode(client, businessId, '2010');
        if (!fromAccountId) {
          const cashAcc = await BusinessRepository.getAccountByCode(client, businessId, '1010');
          fromAccountId = cashAcc.id;
        }

        // Debit Accounts Payable, Credit Cash/Bank
        journalLines.push({ accountId: payAcc.id, debitMinor: amountMinor.toString(), creditMinor: 0, description: 'Supplier khata payment made' });
        journalLines.push({ accountId: fromAccountId, debitMinor: 0, creditMinor: amountMinor.toString(), description: 'Payment disbursed to supplier' });

        // Update supplier balance
        await client.query(
          `UPDATE biz_suppliers SET current_balance_minor = current_balance_minor - $1, updated_at = now() WHERE id = $2 AND business_id = $3`,
          [amountMinor.toString(), payload.supplierId, businessId]
        );
      } else if (paymentType === 'account_transfer') {
        // e.g. Bank to Cash or Cash to Bank
        if (!fromAccountId || !toAccountId) throw new Error('Both source and destination accounts are required for transfer');
        if (fromAccountId === toAccountId) throw new Error('Source and destination accounts must be different');

        journalLines.push({ accountId: toAccountId, debitMinor: amountMinor.toString(), creditMinor: 0, description: 'Funds received from transfer' });
        journalLines.push({ accountId: fromAccountId, debitMinor: 0, creditMinor: amountMinor.toString(), description: 'Funds transferred out' });
      } else if (paymentType === 'owner_contribution') {
        // Owner invests cash/capital into business (Zero effect on P&L)
        const capAcc = await BusinessRepository.getAccountByCode(client, businessId, '3010');
        if (!toAccountId) {
          const cashAcc = await BusinessRepository.getAccountByCode(client, businessId, '1010');
          toAccountId = cashAcc.id;
        }

        journalLines.push({ accountId: toAccountId, debitMinor: amountMinor.toString(), creditMinor: 0, description: 'Owner capital investment received' });
        journalLines.push({ accountId: capAcc.id, debitMinor: 0, creditMinor: amountMinor.toString(), description: 'Owner Capital Equity increased' });
      } else if (paymentType === 'owner_drawing') {
        // Owner withdraws money for personal use (Zero effect on P&L)
        const drawAcc = await BusinessRepository.getAccountByCode(client, businessId, '3020');
        if (!fromAccountId) {
          const cashAcc = await BusinessRepository.getAccountByCode(client, businessId, '1010');
          fromAccountId = cashAcc.id;
        }

        journalLines.push({ accountId: drawAcc.id, debitMinor: amountMinor.toString(), creditMinor: 0, description: 'Owner drawings disbursed' });
        journalLines.push({ accountId: fromAccountId, debitMinor: 0, creditMinor: amountMinor.toString(), description: 'Cash disbursed for owner drawing' });
      }

      const payRes = await client.query(
        `INSERT INTO biz_payments (
          business_id, payment_type, date, amount_minor, customer_id,
          supplier_id, from_account_id, to_account_id, reference, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [businessId, paymentType, paymentDate, amountMinor.toString(), payload.customerId || null, payload.supplierId || null, fromAccountId || null, toAccountId || null, payload.reference || '', payload.notes || '', userId]
      );
      const payment = payRes.rows[0];

      if (journalLines.length >= 2) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: `PAY-${Date.now().toString().slice(-6)}`,
          date: paymentDate,
          entryType: 'payment',
          referenceType: 'payment',
          referenceId: payment.id,
          narration: `Payment: ${paymentType} (${payload.reference || ''})`,
          lines: journalLines,
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_payment', 'biz_payments', payment.id, { paymentType, amount: amountMinor.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return payment;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createPaymentIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_payment',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createPayment(businessId, userId, payload, client),
    });
  },

  async listPayments(businessId, query) {
    return BusinessRepository.listPayments(businessId, query);
  },

  // ---------------------------------------------------------------------------
  // Staff & Payroll
  // ---------------------------------------------------------------------------

  async listEmployees(businessId) {
    return BusinessRepository.listEmployees(businessId);
  },

  async createEmployee(businessId, userId, payload) {
    const emp = await BusinessRepository.createEmployee(businessId, payload);
    await BusinessRepository.logAction(businessId, userId, 'create_employee', 'biz_employees', emp.id, { name: emp.name });
    return emp;
  },

  async listPayrollRuns(businessId) {
    return BusinessRepository.listPayrollRuns(businessId);
  },

  async runPayroll(businessId, userId, { month, paidFromAccountId, notes }, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const emps = await client.query(
        `SELECT * FROM biz_employees WHERE business_id = $1 AND status = 'active'`,
        [businessId]
      );
      if (!emps.rows.length) throw new Error('No active employees found to run payroll');

      let totalSalaryMinor = 0n;
      for (const emp of emps.rows) {
        totalSalaryMinor += BigInt(emp.salary_minor || 0);
      }

      let payAccId = paidFromAccountId;
      if (!payAccId) {
        const cashAcc = await BusinessRepository.getAccountByCode(client, businessId, '1010');
        payAccId = cashAcc.id;
      }

      const today = new Date().toISOString().split('T')[0];

      const runRes = await client.query(
        `INSERT INTO biz_payroll_runs (
          business_id, month, total_salary_minor, status, paid_from_account_id, payment_date, notes
        ) VALUES ($1, $2, $3, 'paid', $4, $5, $6)
        ON CONFLICT (business_id, month) DO UPDATE
        SET total_salary_minor = EXCLUDED.total_salary_minor, status = 'paid', payment_date = EXCLUDED.payment_date
        RETURNING *`,
        [businessId, month, totalSalaryMinor.toString(), payAccId, today, notes || '']
      );
      const payrollRun = runRes.rows[0];

      // Accounting Journal Entry: Debit 6030 Salaries Expense, Credit 1010/1020 Cash/Bank
      const salaryAcc = await BusinessRepository.getAccountByCode(client, businessId, '6030');
      if (totalSalaryMinor > 0n && salaryAcc && payAccId) {
        const lines = [
          { accountId: salaryAcc.id, debitMinor: totalSalaryMinor.toString(), creditMinor: 0, description: `Staff Salaries for ${month}` },
          { accountId: payAccId, debitMinor: 0, creditMinor: totalSalaryMinor.toString(), description: `Disbursed salaries for ${month}` },
        ];

        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: `PAYROLL-${month}`,
          date: today,
          entryType: 'payroll',
          referenceType: 'payroll',
          referenceId: payrollRun.id,
          narration: `Payroll disbursement for ${month}`,
          lines,
          userId,
        });
      }

      if (managesTransaction) await client.query('COMMIT');
      return payrollRun;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async runPayrollIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'run_payroll',
      key: idempotencyKey,
      payload,
      perform: (client) => this.runPayroll(businessId, userId, payload, client),
    });
  },

  // ---------------------------------------------------------------------------
  // Dashboard & Financial Reporting
  // ---------------------------------------------------------------------------

  async getDashboardSummary(businessId) {
    const todayStr = new Date().toISOString().split('T')[0];
    return BusinessRepository.getDashboardSummary(businessId, todayStr);
  },

  async getProfitAndLoss(businessId, { fromDate, toDate }) {
    const from = fromDate || `${new Date().getFullYear()}-01-01`;
    const to = toDate || new Date().toISOString().split('T')[0];
    const client = await getPool().connect();
    try {
      return await AccountingEngine.getProfitAndLoss(client, businessId, { fromDate: from, toDate: to });
    } finally {
      client.release();
    }
  },

  async getTrialBalance(businessId, asOfDate) {
    const client = await getPool().connect();
    try {
      return await AccountingEngine.getTrialBalance(client, businessId, asOfDate);
    } finally {
      client.release();
    }
  },

  async getBalanceSheet(businessId, asOfDate) {
    const client = await getPool().connect();
    try {
      return await AccountingEngine.getBalanceSheet(client, businessId, asOfDate);
    } finally {
      client.release();
    }
  },

  async getCashFlowStatement(businessId, { fromDate, toDate }) {
    const from = fromDate || `${new Date().getFullYear()}-01-01`;
    const to = toDate || new Date().toISOString().split('T')[0];
    const client = await getPool().connect();
    try {
      return await AccountingEngine.getCashFlowStatement(client, businessId, { fromDate: from, toDate: to });
    } finally {
      client.release();
    }
  },

  async getGeneralLedgerAccount(businessId, accountId, { fromDate, toDate }) {
    const from = fromDate || `${new Date().getFullYear()}-01-01`;
    const to = toDate || new Date().toISOString().split('T')[0];
    const client = await getPool().connect();
    try {
      return await AccountingEngine.getGeneralLedgerAccount(client, businessId, accountId, { fromDate: from, toDate: to });
    } finally {
      client.release();
    }
  },

  async listAccounts(businessId) {
    return BusinessRepository.listAccounts(businessId);
  },

  // ---------------------------------------------------------------------------
  // V2: Sales Returns & Refunds
  // ---------------------------------------------------------------------------

  async createSalesReturn(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const sale = await BusinessRepository.getSale(client, businessId, payload.saleId);
      if (!sale) throw new Error('Sale not found');

      const returnDate = payload.returnDate || new Date().toISOString().split('T')[0];
      const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
      const restock = payload.restock !== false;

      let totalRefundMinor = 0n;
      let totalCostBasisMinor = 0n;
      const returnItems = [];

      for (const item of payload.items || []) {
        const saleItem = sale.items.find((si) => si.id === item.saleItemId || si.product_id === item.productId);
        if (!saleItem) throw new Error(`Sale item not found for product ${item.productId}`);
        const qty = Number(item.quantity);
        if (qty <= 0) throw new Error('Return quantity must be greater than 0');

        const unitPriceMinor = BigInt(saleItem.unit_price_minor);
        const unitCostMinor = BigInt(saleItem.unit_cost_minor || 0);
        const refundAmountMinor = BigInt(item.refundAmountMinor || (unitPriceMinor * BigInt(qty)));

        totalRefundMinor += refundAmountMinor;
        totalCostBasisMinor += (unitCostMinor * BigInt(qty));

        returnItems.push({
          saleItemId: saleItem.id,
          productId: saleItem.product_id,
          quantity: qty,
          unitPriceMinor: unitPriceMinor.toString(),
          unitCostMinor: unitCostMinor.toString(),
          refundAmountMinor: refundAmountMinor.toString(),
          condition: item.condition || (restock ? 'restockable' : 'damaged'),
        });

        if (saleItem.product_id) {
          if (item.condition !== 'damaged' && restock) {
            await BusinessRepository.updateProductStock(client, saleItem.product_id, qty, (unitCostMinor * BigInt(qty)).toString(), 'add');
            await BusinessRepository.createStockMovement(client, {
              businessId,
              branchId: sale.branch_id,
              productId: saleItem.product_id,
              movementType: 'return_in',
              quantity: qty,
              unitCostMinor: unitCostMinor.toString(),
              totalCostMinor: (unitCostMinor * BigInt(qty)).toString(),
              referenceType: 'sales_return',
              reason: payload.reason || 'Customer return restocked',
            });
          } else {
            await BusinessRepository.createStockMovement(client, {
              businessId,
              branchId: sale.branch_id,
              productId: saleItem.product_id,
              movementType: 'damage',
              quantity: qty,
              unitCostMinor: unitCostMinor.toString(),
              totalCostMinor: (unitCostMinor * BigInt(qty)).toString(),
              referenceType: 'sales_return',
              reason: payload.reason || 'Customer return damaged write-off',
            });
          }
        }
      }

      const salesReturn = await BusinessRepository.createSalesReturn(client, {
        businessId,
        branchId: sale.branch_id,
        saleId: sale.id,
        returnNumber,
        customerId: sale.customer_id,
        returnDate,
        totalRefundMinor: totalRefundMinor.toString(),
        refundMethod: payload.refundMethod || 'cash',
        refundAccountId: payload.refundAccountId,
        reason: payload.reason,
        restock,
        createdBy: userId,
      });

      for (const rit of returnItems) {
        await BusinessRepository.addSalesReturnItem(client, {
          returnId: salesReturn.id,
          saleItemId: rit.saleItemId,
          productId: rit.productId,
          quantity: rit.quantity,
          unitPriceMinor: rit.unitPriceMinor,
          refundAmountMinor: rit.refundAmountMinor,
          condition: rit.condition,
        });
      }

      // Accounting journal lines
      const returnsAcc = (await BusinessRepository.getAccountByCode(client, businessId, '4110')) ||
                         (await BusinessRepository.getAccountByCode(client, businessId, '4010'));

      let refundAcc;
      if (payload.refundMethod === 'credit_adjustment' && sale.customer_id) {
        refundAcc = await BusinessRepository.getAccountByCode(client, businessId, '1100');
        await BusinessRepository.updateCustomerBalance(client, sale.customer_id, (-totalRefundMinor).toString());
      } else {
        refundAcc = payload.refundAccountId
          ? await BusinessRepository.getAccountById(client, businessId, payload.refundAccountId)
          : await BusinessRepository.getAccountByCode(client, businessId, '1010');
      }

      const journalLines = [
        {
          accountId: returnsAcc.id,
          debitMinor: totalRefundMinor.toString(),
          creditMinor: '0',
          description: `Sales Return ${returnNumber} - refund amount`,
        },
        {
          accountId: refundAcc.id,
          debitMinor: '0',
          creditMinor: totalRefundMinor.toString(),
          description: `Sales Return ${returnNumber} - refund via ${payload.refundMethod || 'cash'}`,
        },
      ];

      if (totalCostBasisMinor > 0n) {
        const cogsAcc = await BusinessRepository.getAccountByCode(client, businessId, '5010');
        const invOrLossAcc = restock
          ? await BusinessRepository.getAccountByCode(client, businessId, '1200')
          : ((await BusinessRepository.getAccountByCode(client, businessId, '6110')) ||
             (await BusinessRepository.getAccountByCode(client, businessId, '6990')));

        journalLines.push(
          {
            accountId: invOrLossAcc.id,
            debitMinor: totalCostBasisMinor.toString(),
            creditMinor: '0',
            description: restock ? 'Restocked inventory at cost' : 'Damaged return written off',
          },
          {
            accountId: cogsAcc.id,
            debitMinor: '0',
            creditMinor: totalCostBasisMinor.toString(),
            description: 'COGS reduction for returned merchandise',
          }
        );
      }

      await AccountingEngine.postJournalEntry(client, {
        businessId,
        branchId: sale.branch_id,
        entryNumber: `JRN-${returnNumber}`,
        date: returnDate,
        entryType: 'return',
        referenceType: 'sales_return',
        referenceId: salesReturn.id,
        narration: `Sales return ${returnNumber} for Invoice ${sale.sale_number}`,
        lines: journalLines,
        userId,
      });

      await BusinessRepository.recordAuditLog(client, businessId, userId, 'create_sales_return', 'biz_sales_returns', salesReturn.id, {
        returnNumber,
        totalRefundMinor: totalRefundMinor.toString(),
        saleNumber: sale.sale_number,
      });

      if (managesTransaction) await client.query('COMMIT');
      return salesReturn;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createSalesReturnIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_sales_return',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createSalesReturn(businessId, userId, payload, client),
    });
  },

  async listSalesReturns(businessId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listSalesReturns(client, businessId);
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // V2: Warehouses & Stock Locations
  // ---------------------------------------------------------------------------

  async listWarehouses(businessId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listWarehouses(client, businessId);
    } finally {
      client.release();
    }
  },

  async createWarehouse(businessId, userId, payload) {
    const client = await getPool().connect();
    try {
      const wh = await BusinessRepository.createWarehouse(client, { businessId, ...payload });
      await BusinessRepository.recordAuditLog(client, businessId, userId, 'create_warehouse', 'biz_warehouses', wh.id, { name: wh.name });
      return wh;
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // V2: Stock Transfers
  // ---------------------------------------------------------------------------

  async createStockTransfer(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;
      const transfer = await BusinessRepository.createStockTransfer(client, {
        businessId,
        fromBranchId: payload.fromBranchId,
        toBranchId: payload.toBranchId,
        transferNumber,
        notes: payload.notes,
        createdBy: userId,
      });

      for (const item of payload.items || []) {
        await BusinessRepository.addStockTransferItem(client, {
          transferId: transfer.id,
          productId: item.productId,
          quantity: item.quantity,
        });

        // Record transit stock movement
        await BusinessRepository.createStockMovement(client, {
          businessId,
          branchId: payload.fromBranchId,
          productId: item.productId,
          movementType: 'return_out',
          quantity: item.quantity,
          referenceType: 'stock_transfer',
          reason: `Dispatched to branch via transfer ${transferNumber}`,
        });
      }

      if (managesTransaction) await client.query('COMMIT');
      return transfer;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createStockTransferIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_stock_transfer',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createStockTransfer(businessId, userId, payload, client),
    });
  },

  async listStockTransfers(businessId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listStockTransfers(client, businessId);
    } finally {
      client.release();
    }
  },

  async getStockTransfer(businessId, transferId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.getStockTransfer(client, businessId, transferId);
    } finally {
      client.release();
    }
  },

  async receiveStockTransfer(businessId, userId, transferId, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const transfer = await BusinessRepository.getStockTransfer(client, businessId, transferId);
      if (!transfer) throw new Error('Stock transfer not found');
      if (transfer.status === 'received') throw new Error('Transfer already received');

      for (const item of transfer.items || []) {
        await BusinessRepository.createStockMovement(client, {
          businessId,
          branchId: transfer.to_branch_id,
          productId: item.product_id,
          movementType: 'return_in',
          quantity: item.quantity,
          referenceType: 'stock_transfer',
          reason: `Received from branch via transfer ${transfer.transfer_number}`,
        });
      }

      const updated = await BusinessRepository.updateStockTransferStatus(client, businessId, transferId, 'received');
      if (managesTransaction) await client.query('COMMIT');
      return updated;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async receiveStockTransferIdempotent(businessId, userId, idempotencyKey, transferId) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'receive_stock_transfer',
      key: idempotencyKey,
      payload: { transferId },
      perform: (client) => this.receiveStockTransfer(businessId, userId, transferId, client),
    });
  },

  // ---------------------------------------------------------------------------
  // V2: Physical Stock Counts & Reconciliation
  // ---------------------------------------------------------------------------

  async createStockCount(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const countNumber = `STK-${Date.now().toString().slice(-6)}`;
      const date = payload.date || new Date().toISOString().split('T')[0];

      const count = await BusinessRepository.createStockCount(client, {
        businessId,
        branchId: payload.branchId,
        countNumber,
        date,
        notes: payload.notes,
        createdBy: userId,
      });

      for (const item of payload.items || []) {
        const product = await BusinessRepository.getProduct(client, businessId, item.productId);
        const expectedQty = Number(product ? product.current_stock : 0);
        const countedQty = Number(item.countedQty);
        const varianceQty = countedQty - expectedQty;
        const unitCostMinor = BigInt(product ? product.purchase_price_minor : 0);
        const adjustmentValueMinor = BigInt(Math.round(Math.abs(varianceQty))) * unitCostMinor;

        await BusinessRepository.addStockCountItem(client, {
          stockCountId: count.id,
          productId: item.productId,
          expectedQty,
          countedQty,
          varianceQty,
          unitCostMinor: unitCostMinor.toString(),
          adjustmentValueMinor: adjustmentValueMinor.toString(),
        });
      }

      if (managesTransaction) await client.query('COMMIT');
      return count;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createStockCountIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_stock_count',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createStockCount(businessId, userId, payload, client),
    });
  },

  async listStockCounts(businessId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listStockCounts(client, businessId);
    } finally {
      client.release();
    }
  },

  async getStockCount(businessId, countId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.getStockCount(client, businessId, countId);
    } finally {
      client.release();
    }
  },

  async reconcileStockCount(businessId, userId, countId, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const count = await BusinessRepository.getStockCount(client, businessId, countId);
      if (!count) throw new Error('Stock count not found');
      if (count.status === 'reconciled') throw new Error('Stock count already reconciled');

      let totalShortageValue = 0n;
      let totalSurplusValue = 0n;

      for (const item of count.items || []) {
        const variance = Number(item.variance_qty);
        if (variance === 0) continue;

        const product = await BusinessRepository.getProduct(client, businessId, item.product_id);
        if (!product) continue;

        const unitCostMinor = BigInt(product.purchase_price_minor || 0);
        const diffMinor = unitCostMinor * BigInt(Math.round(Math.abs(variance)));

        if (variance < 0) {
          totalShortageValue += diffMinor;
          await BusinessRepository.updateProductStock(client, item.product_id, Math.abs(variance), diffMinor.toString(), 'subtract');
          await BusinessRepository.createStockMovement(client, {
            businessId,
            branchId: count.branch_id,
            productId: item.product_id,
            movementType: 'adjustment_sub',
            quantity: Math.abs(variance),
            unitCostMinor: unitCostMinor.toString(),
            totalCostMinor: diffMinor.toString(),
            referenceType: 'stock_count',
            reason: `Physical count variance adjustment: ${count.count_number}`,
          });
        } else {
          totalSurplusValue += diffMinor;
          await BusinessRepository.updateProductStock(client, item.product_id, variance, diffMinor.toString(), 'add');
          await BusinessRepository.createStockMovement(client, {
            businessId,
            branchId: count.branch_id,
            productId: item.product_id,
            movementType: 'adjustment_add',
            quantity: variance,
            unitCostMinor: unitCostMinor.toString(),
            totalCostMinor: diffMinor.toString(),
            referenceType: 'stock_count',
            reason: `Physical count variance adjustment: ${count.count_number}`,
          });
        }
      }

      const netVariance = totalSurplusValue - totalShortageValue;
      if (netVariance !== 0n) {
        const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');
        const lossAcc = (await BusinessRepository.getAccountByCode(client, businessId, '6100')) ||
                        (await BusinessRepository.getAccountByCode(client, businessId, '6990'));

        const lines = [];
        if (netVariance < 0n) {
          const loss = -netVariance;
          lines.push(
            { accountId: lossAcc.id, debitMinor: loss.toString(), creditMinor: '0', description: 'Inventory shrinkage / shortage loss' },
            { accountId: invAcc.id, debitMinor: '0', creditMinor: loss.toString(), description: 'Inventory stock reduction' }
          );
        } else {
          lines.push(
            { accountId: invAcc.id, debitMinor: netVariance.toString(), creditMinor: '0', description: 'Inventory stock surplus gain' },
            { accountId: lossAcc.id, debitMinor: '0', creditMinor: netVariance.toString(), description: 'Inventory adjustment gain' }
          );
        }

        await AccountingEngine.postJournalEntry(client, {
          businessId,
          branchId: count.branch_id,
          entryNumber: `ADJ-${count.count_number}`,
          date: count.date,
          entryType: 'adjustment',
          referenceType: 'stock_count',
          referenceId: count.id,
          narration: `Stock count reconciliation for ${count.count_number}`,
          lines,
          userId,
        });
      }

      await BusinessRepository.updateStockCountStatus(client, businessId, countId, 'reconciled', userId);

      if (managesTransaction) await client.query('COMMIT');
      return { success: true, countId, netVarianceMinor: netVariance.toString() };
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async reconcileStockCountIdempotent(businessId, userId, countId, idempotencyKey) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'reconcile_stock_count',
      key: idempotencyKey,
      payload: { countId },
      perform: (client) => this.reconcileStockCount(businessId, userId, countId, client),
    });
  },

  // ---------------------------------------------------------------------------
  // V2: POS Shifts & Cash Drawer Reconciliation
  // ---------------------------------------------------------------------------

  async getActiveShift(businessId, cashierId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.getActiveShift(client, businessId, cashierId);
    } finally {
      client.release();
    }
  },

  async openShift(businessId, cashierId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');
      const existing = await BusinessRepository.getActiveShift(client, businessId, cashierId);
      if (existing) throw new Error('A cashier shift is already open. Please close it first.');

      const openingCashMinor = BigInt(payload.openingCashMinor || 0);
      const shift = await BusinessRepository.openShift(client, {
        businessId,
        branchId: payload.branchId,
        cashierId,
        openingCashMinor: openingCashMinor.toString(),
        notes: payload.notes,
      });

      if (managesTransaction) await client.query('COMMIT');
      return shift;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async openShiftIdempotent(businessId, cashierId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId: cashierId,
      action: 'open_shift',
      key: idempotencyKey,
      payload,
      perform: (client) => this.openShift(businessId, cashierId, payload, client),
    });
  },

  async closeShift(businessId, cashierId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const activeShift = await BusinessRepository.getActiveShift(client, businessId, cashierId);
      if (!activeShift) throw new Error('No open shift found to close');

      // Calculate cash received and refunded in this shift window
      const salesRes = await client.query(
        `SELECT COALESCE(SUM(amount_paid_minor), 0) AS cash_collected
         FROM biz_sales
         WHERE business_id = $1 AND created_by = $2 AND created_at >= $3 AND payment_method IN ('cash', 'split')`,
        [businessId, cashierId, activeShift.opened_at]
      );
      const cashCollected = BigInt(salesRes.rows[0].cash_collected);

      const refundRes = await client.query(
        `SELECT COALESCE(SUM(total_refund_minor), 0) AS cash_refunded
         FROM biz_sales_returns
         WHERE business_id = $1 AND created_by = $2 AND created_at >= $3 AND refund_method = 'cash'`,
        [businessId, cashierId, activeShift.opened_at]
      );
      const cashRefunded = BigInt(refundRes.rows[0].cash_refunded);

      const openingCash = BigInt(activeShift.opening_cash_minor);
      const expectedCashMinor = openingCash + cashCollected - cashRefunded;
      const actualCashMinor = BigInt(payload.actualCashMinor || 0);
      const varianceMinor = actualCashMinor - expectedCashMinor;

      const closed = await BusinessRepository.closeShift(client, {
        shiftId: activeShift.id,
        businessId,
        expectedCashMinor: expectedCashMinor.toString(),
        actualCashMinor: actualCashMinor.toString(),
        varianceMinor: varianceMinor.toString(),
        notes: payload.notes,
      });

      await BusinessRepository.recordAuditLog(client, businessId, cashierId, 'close_shift', 'biz_pos_shifts', activeShift.id, {
        expectedCashMinor: expectedCashMinor.toString(),
        actualCashMinor: actualCashMinor.toString(),
        varianceMinor: varianceMinor.toString(),
      });

      if (managesTransaction) await client.query('COMMIT');
      return closed;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async closeShiftIdempotent(businessId, cashierId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId: cashierId,
      action: 'close_shift',
      key: idempotencyKey,
      payload,
      perform: (client) => this.closeShift(businessId, cashierId, payload, client),
    });
  },

  async listShifts(businessId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listShifts(client, businessId);
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // V2: Aging Reports (Receivables & Payables)
  // ---------------------------------------------------------------------------

  async getCustomerAging(businessId, asOfDate) {
    const date = asOfDate || new Date().toISOString().split('T')[0];
    const client = await getPool().connect();
    try {
      const customers = await BusinessRepository.getCustomerAging(client, businessId, date);
      let total1_30 = 0n;
      let total31_60 = 0n;
      let total61_90 = 0n;
      let totalOver90 = 0n;
      let grandTotal = 0n;

      for (const c of customers) {
        total1_30 += BigInt(c.bucket_1_30);
        total31_60 += BigInt(c.bucket_31_60);
        total61_90 += BigInt(c.bucket_61_90);
        totalOver90 += BigInt(c.bucket_over_90);
        grandTotal += BigInt(c.current_balance_minor);
      }

      return {
        asOfDate: date,
        customers,
        summary: {
          bucket_1_30: total1_30.toString(),
          bucket_31_60: total31_60.toString(),
          bucket_61_90: total61_90.toString(),
          bucket_over_90: totalOver90.toString(),
          grandTotal: grandTotal.toString(),
        },
      };
    } finally {
      client.release();
    }
  },

  async getSupplierAging(businessId, asOfDate) {
    const date = asOfDate || new Date().toISOString().split('T')[0];
    const client = await getPool().connect();
    try {
      const suppliers = await BusinessRepository.getSupplierAging(client, businessId, date);
      let total1_30 = 0n;
      let total31_60 = 0n;
      let total61_90 = 0n;
      let totalOver90 = 0n;
      let grandTotal = 0n;

      for (const s of suppliers) {
        total1_30 += BigInt(s.bucket_1_30);
        total31_60 += BigInt(s.bucket_31_60);
        total61_90 += BigInt(s.bucket_61_90);
        totalOver90 += BigInt(s.bucket_over_90);
        grandTotal += BigInt(s.current_balance_minor);
      }

      return {
        asOfDate: date,
        suppliers,
        summary: {
          bucket_1_30: total1_30.toString(),
          bucket_31_60: total31_60.toString(),
          bucket_61_90: total61_90.toString(),
          bucket_over_90: totalOver90.toString(),
          grandTotal: grandTotal.toString(),
        },
      };
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // V2: Employee Attendance & Itemized Payroll Breakdown
  // ---------------------------------------------------------------------------

  async logAttendance(businessId, userId, payload) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.logAttendance(client, { businessId, ...payload });
    } finally {
      client.release();
    }
  },

  async listAttendance(businessId, month) {
    const m = month || new Date().toISOString().slice(0, 7);
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listAttendance(client, businessId, m);
    } finally {
      client.release();
    }
  },

  async runItemizedPayroll(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');

      const month = payload.month || new Date().toISOString().slice(0, 7);
      let totalSalaryMinor = 0n;

      const payrollRun = await BusinessRepository.createPayrollRun(client, {
        businessId,
        month,
        totalSalaryMinor: '0',
        paidFromAccountId: payload.paidFromAccountId || null,
        paymentDate: payload.paymentDate || new Date().toISOString().split('T')[0],
        notes: payload.notes,
      });

      for (const item of payload.items || []) {
        const base = BigInt(item.baseSalaryMinor || 0);
        const allowances = BigInt(item.allowancesMinor || 0);
        const deductions = BigInt(item.deductionsMinor || 0);
        const advance = BigInt(item.advanceDeductedMinor || 0);
        const net = base + allowances - deductions - advance;

        totalSalaryMinor += net;

        await BusinessRepository.createPayrollItem(client, {
          payrollRunId: payrollRun.id,
          employeeId: item.employeeId,
          baseSalaryMinor: base.toString(),
          allowancesMinor: allowances.toString(),
          deductionsMinor: deductions.toString(),
          advanceDeductedMinor: advance.toString(),
          netPayableMinor: net.toString(),
          status: payload.paidFromAccountId ? 'paid' : 'approved',
        });
      }

      await client.query(
        `UPDATE biz_payroll_runs SET total_salary_minor = $1, status = $2 WHERE id = $3`,
        [totalSalaryMinor.toString(), payload.paidFromAccountId ? 'paid' : 'approved', payrollRun.id]
      );

      // Accounting journal lines:
      // Debit Salaries & Staff Wages (6030)
      const salaryExpAcc = await BusinessRepository.getAccountByCode(client, businessId, '6030');
      let creditAcc;
      if (payload.paidFromAccountId) {
        creditAcc = await BusinessRepository.getAccountById(client, businessId, payload.paidFromAccountId);
      } else {
        creditAcc = (await BusinessRepository.getAccountByCode(client, businessId, '2030')) ||
                    (await BusinessRepository.getAccountByCode(client, businessId, '2010'));
      }

      if (totalSalaryMinor > 0n) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          branchId: null,
          entryNumber: `PAY-${month}`,
          date: payload.paymentDate || new Date().toISOString().split('T')[0],
          entryType: 'payroll',
          referenceType: 'payroll_run',
          referenceId: payrollRun.id,
          narration: `Payroll disbursement for month ${month}`,
          lines: [
            {
              accountId: salaryExpAcc.id,
              debitMinor: totalSalaryMinor.toString(),
              creditMinor: '0',
              description: `Total staff payroll ${month}`,
            },
            {
              accountId: creditAcc.id,
              debitMinor: '0',
              creditMinor: totalSalaryMinor.toString(),
              description: payload.paidFromAccountId ? 'Staff salary payment' : 'Staff salary accrued liability',
            },
          ],
          userId,
        });
      }

      if (managesTransaction) await client.query('COMMIT');
      return { ...payrollRun, totalSalaryMinor: totalSalaryMinor.toString() };
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async runItemizedPayrollIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'run_itemized_payroll',
      key: idempotencyKey,
      payload,
      perform: (client) => this.runItemizedPayroll(businessId, userId, payload, client),
    });
  },

  // ---------------------------------------------------------------------------
  // V2: Budgets
  // ---------------------------------------------------------------------------

  async createBudget(businessId, userId, payload, externalClient = null) {
    const client = externalClient || (await getPool().connect());
    const managesTransaction = !externalClient;
    try {
      if (managesTransaction) await client.query('BEGIN');
      const budget = await BusinessRepository.createBudget(client, {
        businessId,
        title: payload.title,
        periodType: payload.periodType || 'monthly',
        period: payload.period || new Date().toISOString().slice(0, 7),
        categoryAccountId: payload.categoryAccountId,
        targetAmountMinor: BigInt(payload.targetAmountMinor || 0).toString(),
        notes: payload.notes,
      });
      if (managesTransaction) await client.query('COMMIT');
      return budget;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createBudgetIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_budget',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createBudget(businessId, userId, payload, client),
    });
  },

  async listBudgets(businessId, period) {
    const client = await getPool().connect();
    try {
      const budgets = await BusinessRepository.listBudgets(client, businessId, period);
      // Fetch actual spending for the period to show performance
      for (const b of budgets) {
        if (b.category_account_id) {
          const actRes = await client.query(
            `SELECT COALESCE(SUM(l.debit_minor - l.credit_minor), 0) AS actual_spent
             FROM biz_journal_lines l
             JOIN biz_journal_entries e ON e.id = l.journal_entry_id
             WHERE e.business_id = $1 AND l.account_id = $2 AND to_char(e.date, 'YYYY-MM') = $3`,
            [businessId, b.category_account_id, b.period]
          );
          b.actual_spent_minor = actRes.rows[0].actual_spent;
        } else {
          b.actual_spent_minor = '0';
        }
      }
      return budgets;
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // V2: In-App Notifications
  // ---------------------------------------------------------------------------

  async listNotifications(businessId, unreadOnly = false) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.listNotifications(client, businessId, unreadOnly);
    } finally {
      client.release();
    }
  },

  async markNotificationRead(businessId, notificationId) {
    const client = await getPool().connect();
    try {
      return await BusinessRepository.markNotificationRead(client, businessId, notificationId);
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // Advanced Procurement Subsystem (V3)
  // ---------------------------------------------------------------------------

  // 1. Purchase Requests
  async createPurchaseRequest(businessId, userId, payload) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const reqNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_purchase_requests', 'request_number', 'PR-');
      const pr = await BusinessRepository.createPurchaseRequest(client, businessId, {
        branchId: payload.branchId,
        requestNumber: reqNumber,
        requestedBy: userId,
        department: payload.department,
        requiredByDate: payload.requiredByDate,
        priority: payload.priority,
        notes: payload.notes,
        items: payload.items || [],
      });
      await BusinessRepository.logAction(businessId, userId, 'create_purchase_request', 'biz_purchase_requests', pr.id, { reqNumber });
      await client.query('COMMIT');
      return pr;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async listPurchaseRequests(businessId, query) {
    return BusinessRepository.listPurchaseRequests(businessId, query);
  },

  async getPurchaseRequest(businessId, requestId) {
    return BusinessRepository.getPurchaseRequestById(businessId, requestId);
  },

  async submitPurchaseRequest(businessId, userId, requestId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const pr = await BusinessRepository.getPurchaseRequestById(businessId, requestId);
      if (!pr) throw new Error('Purchase request not found');
      if (pr.status !== 'draft') throw new Error(`Cannot submit purchase request in '${pr.status}' status`);

      const updated = await BusinessRepository.updatePurchaseRequestStatus(client, businessId, requestId, 'pending_approval');
      await BusinessRepository.logAction(businessId, userId, 'submit_purchase_request', 'biz_purchase_requests', requestId, {});
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async approvePurchaseRequest(businessId, userId, requestId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const pr = await BusinessRepository.getPurchaseRequestById(businessId, requestId);
      if (!pr) throw new Error('Purchase request not found');
      if (pr.status !== 'pending_approval') throw new Error(`Cannot approve purchase request in '${pr.status}' status`);

      const updated = await BusinessRepository.updatePurchaseRequestStatus(client, businessId, requestId, 'approved', { approvedBy: userId });
      await BusinessRepository.logAction(businessId, userId, 'approve_purchase_request', 'biz_purchase_requests', requestId, {});
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async rejectPurchaseRequest(businessId, userId, requestId, reason) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const pr = await BusinessRepository.getPurchaseRequestById(businessId, requestId);
      if (!pr) throw new Error('Purchase request not found');
      if (pr.status !== 'pending_approval') throw new Error(`Cannot reject purchase request in '${pr.status}' status`);

      const updated = await BusinessRepository.updatePurchaseRequestStatus(client, businessId, requestId, 'rejected', { approvedBy: userId, rejectionReason: reason });
      await BusinessRepository.logAction(businessId, userId, 'reject_purchase_request', 'biz_purchase_requests', requestId, { reason });
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  // 2. Purchase Orders
  // INVARIANT: Creating a Purchase Order alone DOES NOT post any general ledger entries.
  async createPurchaseOrder(businessId, userId, payload) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const poNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_purchase_orders', 'po_number', 'PO-');

      const items = payload.items || [];
      if (!items.length) throw new Error('Purchase order must contain at least one item');

      let subtotal = 0n;
      let totalTax = 0n;
      let totalDiscount = 0n;
      const verifiedItems = [];

      for (const item of items) {
        const prodRes = await client.query(
          `SELECT id, name FROM biz_products WHERE id = $1 AND business_id = $2`,
          [item.productId, businessId]
        );
        if (!prodRes.rows.length) throw new Error(`Product ${item.productId} not found`);
        const product = prodRes.rows[0];

        const qty = Number(item.quantityOrdered || item.quantity || 1);
        if (qty <= 0) throw new Error('Quantity must be greater than zero');

        const unitPrice = BigInt(item.unitPriceMinor || 0);
        const tax = BigInt(item.taxMinor || 0);
        const discount = BigInt(item.discountMinor || 0);
        const lineTotal = (unitPrice * BigInt(Math.round(qty))) + tax - discount;

        subtotal += unitPrice * BigInt(Math.round(qty));
        totalTax += tax;
        totalDiscount += discount;

        verifiedItems.push({
          productId: product.id,
          productName: product.name,
          quantityOrdered: qty,
          unitPriceMinor: unitPrice,
          taxMinor: tax,
          discountMinor: discount,
          lineTotalMinor: lineTotal,
        });
      }

      const totalAmount = subtotal + totalTax - totalDiscount;

      const po = await BusinessRepository.createPurchaseOrder(client, businessId, {
        branchId: payload.branchId,
        supplierId: payload.supplierId,
        purchaseRequestId: payload.purchaseRequestId,
        poNumber,
        date: payload.date || new Date().toISOString().split('T')[0],
        expectedDeliveryDate: payload.expectedDeliveryDate,
        paymentTerms: payload.paymentTerms || 'net_30',
        subtotalMinor: subtotal,
        taxMinor: totalTax,
        discountMinor: totalDiscount,
        totalAmountMinor: totalAmount,
        notes: payload.notes,
        createdBy: userId,
        items: verifiedItems,
      });

      // If created from PR, mark PR as converted
      if (payload.purchaseRequestId) {
        await BusinessRepository.updatePurchaseRequestStatus(client, businessId, payload.purchaseRequestId, 'converted_to_po');
      }

      await BusinessRepository.logAction(businessId, userId, 'create_purchase_order', 'biz_purchase_orders', po.id, { poNumber, total: totalAmount.toString() });
      await client.query('COMMIT');
      return po;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async listPurchaseOrders(businessId, query) {
    return BusinessRepository.listPurchaseOrders(businessId, query);
  },

  async getPurchaseOrder(businessId, poId) {
    return BusinessRepository.getPurchaseOrderById(businessId, poId);
  },

  async submitPurchaseOrder(businessId, userId, poId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const po = await BusinessRepository.getPurchaseOrderById(businessId, poId);
      if (!po) throw new Error('Purchase order not found');
      if (po.status !== 'draft') throw new Error(`Cannot submit purchase order in '${po.status}' status`);

      const updated = await BusinessRepository.updatePurchaseOrderStatus(client, businessId, poId, 'pending_approval');
      await BusinessRepository.logAction(businessId, userId, 'submit_purchase_order', 'biz_purchase_orders', poId, {});
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async approvePurchaseOrder(businessId, userId, poId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const po = await BusinessRepository.getPurchaseOrderById(businessId, poId);
      if (!po) throw new Error('Purchase order not found');
      if (po.status !== 'pending_approval' && po.status !== 'draft') throw new Error(`Cannot approve purchase order in '${po.status}' status`);

      const updated = await BusinessRepository.updatePurchaseOrderStatus(client, businessId, poId, 'approved', { approvedBy: userId });
      await BusinessRepository.logAction(businessId, userId, 'approve_purchase_order', 'biz_purchase_orders', poId, {});
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async rejectPurchaseOrder(businessId, userId, poId, reason) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const po = await BusinessRepository.getPurchaseOrderById(businessId, poId);
      if (!po) throw new Error('Purchase order not found');
      if (po.status !== 'pending_approval') throw new Error(`Cannot reject purchase order in '${po.status}' status`);

      const updated = await BusinessRepository.updatePurchaseOrderStatus(client, businessId, poId, 'rejected', { approvedBy: userId, rejectionReason: reason });
      await BusinessRepository.logAction(businessId, userId, 'reject_purchase_order', 'biz_purchase_orders', poId, { reason });
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async sendPurchaseOrder(businessId, userId, poId) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const po = await BusinessRepository.getPurchaseOrderById(businessId, poId);
      if (!po) throw new Error('Purchase order not found');
      if (po.status !== 'approved') throw new Error(`Only approved purchase orders can be sent to suppliers`);

      const updated = await BusinessRepository.updatePurchaseOrderStatus(client, businessId, poId, 'sent_to_supplier');
      await BusinessRepository.logAction(businessId, userId, 'send_purchase_order', 'biz_purchase_orders', poId, {});
      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  // 3. Goods Received Notes (GRN) & Weighted-Average Costing
  async createGrn(businessId, userId, payload, existingClient = null) {
    const client = existingClient || (await getPool().connect());
    const managesTransaction = !existingClient;

    try {
      if (managesTransaction) await client.query('BEGIN');

      const po = await BusinessRepository.getPurchaseOrderById(businessId, payload.poId);
      if (!po) throw new Error('Purchase order not found');
      if (!['approved', 'sent_to_supplier', 'partially_received'].includes(po.status)) {
        throw new Error(`Cannot receive goods for purchase order in '${po.status}' status`);
      }

      const grnNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_grns', 'grn_number', 'GRN-');
      const items = payload.items || [];
      if (!items.length) throw new Error('GRN must receive at least one item');

      let totalReceivedValue = 0n;
      const verifiedGrnItems = [];

      for (const item of items) {
        const poItem = po.items.find((i) => i.id === item.poItemId);
        if (!poItem) throw new Error(`PO item ${item.poItemId} not found on this Purchase Order`);

        const rcvQty = Number(item.quantityReceived || 0);
        if (rcvQty <= 0) throw new Error('Received quantity must be greater than zero');

        const remainingQty = Number(poItem.quantity_ordered) - Number(poItem.quantity_received);
        if (rcvQty > remainingQty) {
          throw new Error(`Cannot receive ${rcvQty} for '${poItem.product_name}'. Remaining ordered quantity is ${remainingQty}`);
        }

        const unitCost = BigInt(item.unitCostMinor !== undefined ? item.unitCostMinor : poItem.unit_price_minor);
        const lineTotal = unitCost * BigInt(Math.round(rcvQty));
        totalReceivedValue += lineTotal;

        // Fetch product with row lock for stock & weighted-average cost update
        const prodRes = await client.query(
          `SELECT id, name, current_stock, purchase_price_minor, inventory_valuation_minor
           FROM biz_products WHERE id = $1 AND business_id = $2 FOR UPDATE`,
          [poItem.product_id, businessId]
        );
        if (!prodRes.rows.length) throw new Error(`Product ${poItem.product_id} not found`);
        const product = prodRes.rows[0];

        // Weighted-Average Cost Calculation
        const oldStock = Number(product.current_stock || 0);
        const oldValuation = BigInt(product.inventory_valuation_minor || 0);
        const newStock = oldStock + rcvQty;
        const newValuation = oldValuation + lineTotal;
        const newUnitCost = newStock > 0 ? (newValuation / BigInt(Math.round(newStock))) : unitCost;

        await client.query(
          `UPDATE biz_products
           SET current_stock = $1, purchase_price_minor = $2, inventory_valuation_minor = $3, updated_at = now()
           WHERE id = $4 AND business_id = $5`,
          [newStock, newUnitCost.toString(), newValuation.toString(), product.id, businessId]
        );

        // Record stock movement (Inventory Ledger)
        await client.query(
          `INSERT INTO biz_stock_movements (
            business_id, branch_id, product_id, movement_type, quantity, unit_cost_minor,
            total_cost_minor, reference_type, reference_id, reason
          ) VALUES ($1, $2, $3, 'purchase', $4, $5, $6, 'grn', $7, $8)`,
          [businessId, po.branch_id || null, product.id, rcvQty, unitCost.toString(), lineTotal.toString(), po.id, `GRN received #${grnNumber}`]
        );

        // Update PO item received quantity
        await BusinessRepository.updatePoItemReceivedQty(client, poItem.id, rcvQty);

        verifiedGrnItems.push({
          poItemId: poItem.id,
          productId: product.id,
          quantityReceived: rcvQty,
          unitCostMinor: unitCost,
          totalCostMinor: lineTotal,
          batchNumber: item.batchNumber || '',
          expiryDate: item.expiryDate || null,
        });
      }

      // Create GRN header and items
      const grn = await BusinessRepository.createGrn(client, businessId, {
        branchId: po.branch_id,
        warehouseId: payload.warehouseId,
        poId: po.id,
        supplierId: po.supplier_id,
        grnNumber,
        receiveDate: payload.receiveDate || new Date().toISOString().split('T')[0],
        deliveryChallanNumber: payload.deliveryChallanNumber,
        totalReceivedValueMinor: totalReceivedValue,
        notes: payload.notes,
        receivedBy: userId,
        items: verifiedGrnItems,
      });

      // Update PO status: check if all items are fully received
      const refreshedPo = await BusinessRepository.getPurchaseOrderById(businessId, po.id);
      const isFullyReceived = refreshedPo.items.every((i) => Number(i.quantity_received) >= Number(i.quantity_ordered));
      await BusinessRepository.updatePurchaseOrderStatus(client, businessId, po.id, isFullyReceived ? 'fully_received' : 'partially_received');

      // Double-Entry Clearing Accounting Posting
      // Dr Merchandise Inventory (1200)
      // Cr Goods Received Not Invoiced / Accrued Purchases (2040)
      const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');
      let grniAcc = await BusinessRepository.getAccountByCode(client, businessId, '2040');

      if (!grniAcc) {
        // Fallback: create 2040 if business was initialized before V3
        const newAcc = await client.query(
          `INSERT INTO biz_accounts (business_id, code, name, type, subtype, is_system)
           VALUES ($1, '2040', 'Goods Received Not Invoiced (GRNI)', 'liability', 'payable', true)
           ON CONFLICT (business_id, code) DO UPDATE SET is_system = true
           RETURNING *`,
          [businessId]
        );
        grniAcc = newAcc.rows[0];
      }

      if (totalReceivedValue > 0n && invAcc && grniAcc) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: grnNumber,
          date: grn.receive_date,
          entryType: 'purchase',
          referenceType: 'grn',
          referenceId: grn.id,
          narration: `Goods Received Note #${grnNumber} for PO #${po.po_number}`,
          lines: [
            { accountId: invAcc.id, debitMinor: totalReceivedValue.toString(), creditMinor: 0, description: `Inventory receipt #${grnNumber}` },
            { accountId: grniAcc.id, debitMinor: 0, creditMinor: totalReceivedValue.toString(), description: `Accrued purchases clearing for GRN #${grnNumber}` },
          ],
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_grn', 'biz_grns', grn.id, { grnNumber, totalValue: totalReceivedValue.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return grn;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createGrnIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_grn',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createGrn(businessId, userId, payload, client),
    });
  },

  async listGrns(businessId, query) {
    return BusinessRepository.listGrns(businessId, query);
  },

  async getGrn(businessId, grnId) {
    return BusinessRepository.getGrnById(businessId, grnId);
  },

  // 4. Supplier Bills (Invoices) & Accounts Payable
  async createSupplierBill(businessId, userId, payload, existingClient = null) {
    const client = existingClient || (await getPool().connect());
    const managesTransaction = !existingClient;

    try {
      if (managesTransaction) await client.query('BEGIN');

      const billNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_supplier_bills', 'bill_number', 'BILL-');
      const items = payload.items || [];
      if (!items.length) throw new Error('Supplier bill must contain at least one line item');

      let subtotal = 0n;
      let totalTax = 0n;
      let totalDiscount = 0n;
      const verifiedBillItems = [];

      for (const item of items) {
        const qty = Number(item.quantity || 1);
        if (qty <= 0) throw new Error('Quantity must be greater than zero');

        const unitPrice = BigInt(item.unitPriceMinor || 0);
        const tax = BigInt(item.taxMinor || 0);
        const lineTotal = (unitPrice * BigInt(Math.round(qty))) + tax;

        subtotal += unitPrice * BigInt(Math.round(qty));
        totalTax += tax;

        if (item.poItemId) {
          await BusinessRepository.updatePoItemBilledQty(client, item.poItemId, qty);
        }

        verifiedBillItems.push({
          productId: item.productId || null,
          poItemId: item.poItemId || null,
          description: item.description || item.productName || 'Bill line item',
          quantity: qty,
          unitPriceMinor: unitPrice,
          taxMinor: tax,
          lineTotalMinor: lineTotal,
        });
      }

      totalDiscount = BigInt(payload.discountMinor || 0);
      const grandTotal = subtotal + totalTax - totalDiscount;
      const amountPaid = BigInt(payload.amountPaidMinor || 0);
      const balanceDue = grandTotal - amountPaid;

      const bill = await BusinessRepository.createSupplierBill(client, businessId, {
        supplierId: payload.supplierId,
        poId: payload.poId,
        grnId: payload.grnId,
        billNumber,
        supplierInvoiceNumber: payload.supplierInvoiceNumber,
        billDate: payload.billDate || new Date().toISOString().split('T')[0],
        dueDate: payload.dueDate || payload.billDate || new Date().toISOString().split('T')[0],
        subtotalMinor: subtotal,
        taxMinor: totalTax,
        discountMinor: totalDiscount,
        totalAmountMinor: grandTotal,
        amountPaidMinor: amountPaid,
        balanceDueMinor: balanceDue,
        notes: payload.notes,
        createdBy: userId,
        items: verifiedBillItems,
      });

      // Update Supplier Khata balance: add balance due to accounts payable
      if (balanceDue > 0n) {
        await client.query(
          `UPDATE biz_suppliers
           SET current_balance_minor = current_balance_minor + $1, updated_at = now()
           WHERE id = $2 AND business_id = $3`,
          [balanceDue.toString(), payload.supplierId, businessId]
        );
      }

      // Check if PO is completely billed
      if (payload.poId) {
        const po = await BusinessRepository.getPurchaseOrderById(businessId, payload.poId);
        if (po) {
          const allBilled = po.items.every((i) => Number(i.quantity_billed) >= Number(i.quantity_ordered));
          if (allBilled) {
            await BusinessRepository.updatePurchaseOrderStatus(client, businessId, po.id, 'billed');
          }
        }
      }

      // Double-Entry Accounting Posting
      // When matching GRN:
      //   Dr GRNI / Accrued Purchases Clearing (2040)
      //   (Optional: Dr Input Tax Receivable 1150)
      //   Cr Accounts Payable / Supplier Khata (2010)
      // If direct bill without GRN:
      //   Dr Merchandise Inventory (1200) or Expense
      //   Cr Accounts Payable (2010)
      const apAcc = await BusinessRepository.getAccountByCode(client, businessId, '2010');
      let grniAcc = await BusinessRepository.getAccountByCode(client, businessId, '2040');
      const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');

      const debitAcc = payload.grnId ? (grniAcc || invAcc) : invAcc;

      if (grandTotal > 0n && debitAcc && apAcc) {
        const journalLines = [
          { accountId: debitAcc.id, debitMinor: grandTotal.toString(), creditMinor: 0, description: `Goods billed under invoice #${billNumber}` },
          { accountId: apAcc.id, debitMinor: 0, creditMinor: grandTotal.toString(), description: `Accounts payable for supplier bill #${billNumber}` },
        ];

        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: billNumber,
          date: bill.bill_date,
          entryType: 'purchase',
          referenceType: 'supplier_bill',
          referenceId: bill.id,
          narration: `Supplier Bill #${billNumber} from supplier invoice ${payload.supplierInvoiceNumber || ''}`,
          lines: journalLines,
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_supplier_bill', 'biz_supplier_bills', bill.id, { billNumber, grandTotal: grandTotal.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return bill;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createSupplierBillIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_supplier_bill',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createSupplierBill(businessId, userId, payload, client),
    });
  },

  async listSupplierBills(businessId, query) {
    return BusinessRepository.listSupplierBills(businessId, query);
  },

  async getSupplierBill(businessId, billId) {
    return BusinessRepository.getSupplierBillById(businessId, billId);
  },

  // 5. Supplier Payments & Allocations
  async createSupplierPayment(businessId, userId, payload, existingClient = null) {
    const client = existingClient || (await getPool().connect());
    const managesTransaction = !existingClient;

    try {
      if (managesTransaction) await client.query('BEGIN');

      const amountMinor = BigInt(payload.amountMinor || 0);
      if (amountMinor <= 0n) throw new Error('Payment amount must be greater than zero');

      const supplier = await BusinessRepository.getSupplierById(businessId, payload.supplierId);
      if (!supplier) throw new Error('Supplier not found');

      // 1. Record payment in biz_payments
      const payRes = await client.query(
        `INSERT INTO biz_payments (
          business_id, payment_type, date, amount_minor, supplier_id,
          payment_method, payment_account_id, reference, notes, created_by
        ) VALUES ($1, 'supplier_payment', $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId, payload.date || new Date().toISOString().split('T')[0],
          amountMinor.toString(), payload.supplierId,
          payload.paymentMethod || 'cash', payload.paymentAccountId || null,
          payload.reference || '', payload.notes || '', userId
        ]
      );
      const payment = payRes.rows[0];

      // 2. If allocated against a specific bill
      if (payload.billId) {
        const bill = await BusinessRepository.getSupplierBillById(businessId, payload.billId);
        if (!bill) throw new Error('Target supplier bill not found');
        await BusinessRepository.allocateSupplierPayment(client, payment.id, bill.id, amountMinor);
        await BusinessRepository.updateSupplierBillPayment(client, businessId, bill.id, amountMinor);
      }

      // 3. Reduce Supplier Khata balance
      await client.query(
        `UPDATE biz_suppliers
         SET current_balance_minor = current_balance_minor - $1, updated_at = now()
         WHERE id = $2 AND business_id = $3`,
        [amountMinor.toString(), payload.supplierId, businessId]
      );

      // 4. Double-Entry Posting:
      // Dr Accounts Payable (2010 - Supplier Khata)
      // Cr Cash/Bank (1010/1020)
      const apAcc = await BusinessRepository.getAccountByCode(client, businessId, '2010');
      let payAcc = null;
      if (payload.paymentAccountId) {
        payAcc = await client.query('SELECT id FROM biz_accounts WHERE id = $1 AND business_id = $2', [payload.paymentAccountId, businessId]);
        payAcc = payAcc.rows[0];
      }
      if (!payAcc) {
        const subtype = payload.paymentMethod === 'bank' ? 'bank' : payload.paymentMethod === 'wallet' ? 'wallet' : 'cash';
        payAcc = await BusinessRepository.getAccountBySubtype(client, businessId, subtype);
      }

      if (apAcc && payAcc) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: `SPAY-${payment.id.slice(0, 8)}`,
          date: payment.date,
          entryType: 'payment',
          referenceType: 'payment',
          referenceId: payment.id,
          narration: `Supplier payment of Rs ${(Number(amountMinor) / 100).toFixed(2)} to ${supplier.name}`,
          lines: [
            { accountId: apAcc.id, debitMinor: amountMinor.toString(), creditMinor: 0, description: `Reduction in liability to ${supplier.name}` },
            { accountId: payAcc.id, debitMinor: 0, creditMinor: amountMinor.toString(), description: `Payment disbursed from cash/bank` },
          ],
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_supplier_payment', 'biz_payments', payment.id, { amount: amountMinor.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return payment;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createSupplierPaymentIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_supplier_payment',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createSupplierPayment(businessId, userId, payload, client),
    });
  },

  // 6. Purchase Returns (Debit Notes)
  async createPurchaseReturn(businessId, userId, payload, existingClient = null) {
    const client = existingClient || (await getPool().connect());
    const managesTransaction = !existingClient;

    try {
      if (managesTransaction) await client.query('BEGIN');

      const returnNumber = await BusinessRepository.getNextSequenceNumber(client, businessId, 'biz_purchase_returns', 'return_number', 'PRN-');
      const items = payload.items || [];
      if (!items.length) throw new Error('Purchase return must contain at least one item');

      let totalReturnAmount = 0n;
      const verifiedReturnItems = [];

      for (const item of items) {
        const prodRes = await client.query(
          `SELECT id, name, current_stock, purchase_price_minor, inventory_valuation_minor
           FROM biz_products WHERE id = $1 AND business_id = $2 FOR UPDATE`,
          [item.productId, businessId]
        );
        if (!prodRes.rows.length) throw new Error(`Product ${item.productId} not found`);
        const product = prodRes.rows[0];

        const retQty = Number(item.quantity || 1);
        if (retQty <= 0) throw new Error('Return quantity must be greater than zero');

        const unitCost = BigInt(item.unitCostMinor !== undefined ? item.unitCostMinor : product.purchase_price_minor);
        const lineTotal = unitCost * BigInt(Math.round(retQty));
        totalReturnAmount += lineTotal;

        // Reduce stock in biz_products
        const oldStock = Number(product.current_stock || 0);
        const newStock = Math.max(0, oldStock - retQty);
        const newValuation = BigInt(product.purchase_price_minor) * BigInt(Math.max(0, Math.round(newStock)));

        await client.query(
          `UPDATE biz_products
           SET current_stock = $1, inventory_valuation_minor = $2, updated_at = now()
           WHERE id = $3 AND business_id = $4`,
          [newStock, newValuation.toString(), product.id, businessId]
        );

        // Record stock movement (outward return)
        await client.query(
          `INSERT INTO biz_stock_movements (
            business_id, branch_id, product_id, movement_type, quantity, unit_cost_minor,
            total_cost_minor, reference_type, reference_id, reason
          ) VALUES ($1, $2, $3, 'return_out', $4, $5, $6, 'purchase_return', $7, $8)`,
          [businessId, payload.branchId || null, product.id, retQty, unitCost.toString(), lineTotal.toString(), payload.supplierId, `Purchase Return #${returnNumber}`]
        );

        verifiedReturnItems.push({
          productId: product.id,
          quantity: retQty,
          unitCostMinor: unitCost,
          lineTotalMinor: lineTotal,
        });
      }

      const prn = await BusinessRepository.createPurchaseReturn(client, businessId, {
        branchId: payload.branchId,
        supplierId: payload.supplierId,
        poId: payload.poId,
        billId: payload.billId,
        returnNumber,
        returnDate: payload.returnDate || new Date().toISOString().split('T')[0],
        totalAmountMinor: totalReturnAmount,
        refundMethod: payload.refundMethod || 'credit_note',
        refundAccountId: payload.refundAccountId,
        reason: payload.reason,
        notes: payload.notes,
        createdBy: userId,
        items: verifiedReturnItems,
      });

      // Reduce Supplier Khata balance (debit note decreases what we owe supplier)
      if (totalReturnAmount > 0n && (payload.refundMethod === 'credit_note' || !payload.refundMethod)) {
        await client.query(
          `UPDATE biz_suppliers
           SET current_balance_minor = current_balance_minor - $1, updated_at = now()
           WHERE id = $2 AND business_id = $3`,
          [totalReturnAmount.toString(), payload.supplierId, businessId]
        );

        if (payload.billId) {
          await BusinessRepository.updateSupplierBillPayment(client, businessId, payload.billId, totalReturnAmount);
        }
      }

      // Double-Entry Accounting Posting:
      // Dr Accounts Payable (2010 - Supplier Khata) [or Cash if cash refund received]
      // Cr Merchandise Inventory (1200)
      const apAcc = await BusinessRepository.getAccountByCode(client, businessId, '2010');
      const invAcc = await BusinessRepository.getAccountByCode(client, businessId, '1200');

      if (totalReturnAmount > 0n && apAcc && invAcc) {
        await AccountingEngine.postJournalEntry(client, {
          businessId,
          entryNumber: returnNumber,
          date: prn.return_date,
          entryType: 'purchase',
          referenceType: 'purchase_return',
          referenceId: prn.id,
          narration: `Debit Note #${returnNumber} for purchase return`,
          lines: [
            { accountId: apAcc.id, debitMinor: totalReturnAmount.toString(), creditMinor: 0, description: `Debit note reduction in supplier khata` },
            { accountId: invAcc.id, debitMinor: 0, creditMinor: totalReturnAmount.toString(), description: `Inventory reduction for purchase return #${returnNumber}` },
          ],
          userId,
        });
      }

      await BusinessRepository.logAction(businessId, userId, 'create_purchase_return', 'biz_purchase_returns', prn.id, { returnNumber, total: totalReturnAmount.toString() });
      if (managesTransaction) await client.query('COMMIT');
      return prn;
    } catch (e) {
      if (managesTransaction) await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      if (managesTransaction) client.release();
    }
  },

  async createPurchaseReturnIdempotent(businessId, userId, idempotencyKey, payload) {
    return runBusinessIdempotent({
      businessId,
      userId,
      action: 'create_purchase_return',
      key: idempotencyKey,
      payload,
      perform: (client) => this.createPurchaseReturn(businessId, userId, payload, client),
    });
  },

  async listPurchaseReturns(businessId, query) {
    return BusinessRepository.listPurchaseReturns(businessId, query);
  },

  async getPurchaseReturn(businessId, returnId) {
    return BusinessRepository.getPurchaseReturnById(businessId, returnId);
  },
};

module.exports = BusinessService;

