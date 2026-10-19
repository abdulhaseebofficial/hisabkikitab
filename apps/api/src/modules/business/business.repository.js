/**
 * Database repository for Business Mode operations.
 */

const { getPool } = require('../../infrastructure/database/pool');
const { DEFAULT_CHART_OF_ACCOUNTS } = require('@hisabkikitab/contracts/business');

const BusinessRepository = {
  // ---------------------------------------------------------------------------
  // Business Profiles & Branches
  // ---------------------------------------------------------------------------

  async createBusiness(client, { ownerId, name, category, businessType, description, currency, contactNumber, email, address, city, country, taxId, openingBalances = {} }) {
    // 1. Create Business
    const bizRes = await client.query(
      `INSERT INTO businesses (
        owner_id, name, category, business_type, description, currency,
        contact_number, email, address, city, country, tax_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [ownerId, name, category || 'general', businessType || 'retail', description || '', currency || 'PKR', contactNumber || '', email || '', address || '', city || '', country || 'PK', taxId || '']
    );
    const business = bizRes.rows[0];

    // 2. Default Settings
    await client.query(
      `INSERT INTO business_settings (business_id) VALUES ($1)`,
      [business.id]
    );

    // 3. Default Main Branch
    const branchRes = await client.query(
      `INSERT INTO business_branches (business_id, name, code, is_default)
       VALUES ($1, 'Main Branch', 'MAIN', true)
       RETURNING *`,
      [business.id]
    );
    const branch = branchRes.rows[0];

    // 4. Assign Owner Role
    await client.query(
      `INSERT INTO business_members (business_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [business.id, ownerId]
    );

    // 5. Initialize Standard Chart of Accounts
    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      await client.query(
        `INSERT INTO biz_accounts (business_id, code, name, type, subtype, currency, is_system)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (business_id, code) DO NOTHING`,
        [business.id, acc.code, acc.name, acc.type, acc.subtype, currency || 'PKR']
      );
    }

    return { business, branch };
  },

  async listUserBusinesses(userId) {
    const { rows } = await getPool().query(
      `SELECT b.*, bm.role, bs.enable_pos, bs.enable_inventory, bs.enable_customer_khata, bs.enable_supplier_khata
       FROM businesses b
       JOIN business_members bm ON bm.business_id = b.id
       LEFT JOIN business_settings bs ON bs.business_id = b.id
       WHERE bm.user_id = $1 AND bm.is_active = true
       ORDER BY b.created_at ASC`,
      [userId]
    );
    return rows;
  },

  async getBusinessById(businessId) {
    const { rows } = await getPool().query(
      `SELECT b.*, bs.enable_inventory, bs.enable_pos, bs.enable_purchases,
              bs.enable_customer_khata, bs.enable_supplier_khata, bs.enable_payroll,
              bs.enable_tax, bs.default_tax_rate, bs.invoice_prefix, bs.invoice_next_number,
              bs.invoice_footer_note, bs.costing_method
       FROM businesses b
       LEFT JOIN business_settings bs ON bs.business_id = b.id
       WHERE b.id = $1`,
      [businessId]
    );
    return rows[0] || null;
  },

  async getMembership(businessId, userId) {
    const { rows } = await getPool().query(
      `SELECT * FROM business_members
       WHERE business_id = $1 AND user_id = $2 AND is_active = true`,
      [businessId, userId]
    );
    return rows[0] || null;
  },

  async updateBusiness(businessId, updates, settingsUpdates) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      if (updates && Object.keys(updates).length > 0) {
        const fields = [];
        const values = [businessId];
        let idx = 2;
        for (const [key, val] of Object.entries(updates)) {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
        await client.query(`UPDATE businesses SET ${fields.join(', ')}, updated_at = now() WHERE id = $1`, values);
      }

      if (settingsUpdates && Object.keys(settingsUpdates).length > 0) {
        const sFields = [];
        const sValues = [businessId];
        let sIdx = 2;
        for (const [key, val] of Object.entries(settingsUpdates)) {
          sFields.push(`${key} = $${sIdx++}`);
          sValues.push(val);
        }
        await client.query(`UPDATE business_settings SET ${sFields.join(', ')} WHERE business_id = $1`, sValues);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // Chart of Accounts
  // ---------------------------------------------------------------------------

  async listAccounts(businessId) {
    const { rows } = await getPool().query(
      `SELECT * FROM biz_accounts
       WHERE business_id = $1 AND is_active = true
       ORDER BY code ASC`,
      [businessId]
    );
    return rows;
  },

  async getAccountBySubtype(clientOrPool, businessId, subtype) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM biz_accounts
       WHERE business_id = $1 AND subtype = $2 AND is_active = true
       LIMIT 1`,
      [businessId, subtype]
    );
    return rows[0] || null;
  },

  async getAccountByCode(clientOrPool, businessId, code) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM biz_accounts
       WHERE business_id = $1 AND code = $2
       LIMIT 1`,
      [businessId, code]
    );
    return rows[0] || null;
  },

  // ---------------------------------------------------------------------------
  // Customers & Khata
  // ---------------------------------------------------------------------------

  async listCustomers(businessId, search = '') {
    const params = [businessId];
    let filter = '';
    if (search) {
      params.push(`%${search}%`);
      filter = `AND (name ILIKE $2 OR phone ILIKE $2)`;
    }
    const { rows } = await getPool().query(
      `SELECT * FROM biz_customers
       WHERE business_id = $1 AND is_active = true ${filter}
       ORDER BY name ASC`,
      params
    );
    return rows;
  },

  async getCustomerById(businessId, customerId) {
    const { rows } = await getPool().query(
      `SELECT * FROM biz_customers WHERE business_id = $1 AND id = $2`,
      [businessId, customerId]
    );
    return rows[0] || null;
  },

  async createCustomer(businessId, { name, phone, email, address, creditLimitMinor = 0, openingBalanceMinor = 0, notes }) {
    const { rows } = await getPool().query(
      `INSERT INTO biz_customers (
        business_id, name, phone, email, address, credit_limit_minor,
        opening_balance_minor, current_balance_minor, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
      RETURNING *`,
      [businessId, name, phone || '', email || '', address || '', creditLimitMinor, openingBalanceMinor, notes || '']
    );
    return rows[0];
  },

  async getCustomerLedger(businessId, customerId) {
    const { rows } = await getPool().query(
      `(
        SELECT id, date, 'sale' AS type, sale_number AS reference, total_amount_minor AS debit_minor, amount_paid_minor AS credit_minor, balance_due_minor, notes, created_at
        FROM biz_sales
        WHERE business_id = $1 AND customer_id = $2
      ) UNION ALL (
        SELECT id, date, 'payment' AS type, reference, 0 AS debit_minor, amount_minor AS credit_minor, 0 AS balance_due_minor, notes, created_at
        FROM biz_payments
        WHERE business_id = $1 AND customer_id = $2 AND payment_type = 'customer_payment'
      )
      ORDER BY date DESC, created_at DESC`,
      [businessId, customerId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Suppliers & Khata
  // ---------------------------------------------------------------------------

  async listSuppliers(businessId, search = '') {
    const params = [businessId];
    let filter = '';
    if (search) {
      params.push(`%${search}%`);
      filter = `AND (name ILIKE $2 OR company_name ILIKE $2 OR phone ILIKE $2)`;
    }
    const { rows } = await getPool().query(
      `SELECT * FROM biz_suppliers
       WHERE business_id = $1 AND is_active = true ${filter}
       ORDER BY name ASC`,
      params
    );
    return rows;
  },

  async getSupplierById(businessId, supplierId) {
    const { rows } = await getPool().query(
      `SELECT * FROM biz_suppliers WHERE business_id = $1 AND id = $2`,
      [businessId, supplierId]
    );
    return rows[0] || null;
  },

  async createSupplier(businessId, { name, companyName, phone, email, address, openingBalanceMinor = 0, notes }) {
    const { rows } = await getPool().query(
      `INSERT INTO biz_suppliers (
        business_id, name, company_name, phone, email, address,
        opening_balance_minor, current_balance_minor, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8)
      RETURNING *`,
      [businessId, name, companyName || '', phone || '', email || '', address || '', openingBalanceMinor, notes || '']
    );
    return rows[0];
  },

  async getSupplierLedger(businessId, supplierId) {
    const { rows } = await getPool().query(
      `(
        SELECT id, date, 'purchase' AS type, purchase_number AS reference, total_amount_minor AS credit_minor, amount_paid_minor AS debit_minor, balance_due_minor, notes, created_at
        FROM biz_purchases
        WHERE business_id = $1 AND supplier_id = $2
      ) UNION ALL (
        SELECT id, date, 'payment' AS type, reference, amount_minor AS debit_minor, 0 AS credit_minor, 0 AS balance_due_minor, notes, created_at
        FROM biz_payments
        WHERE business_id = $1 AND supplier_id = $2 AND payment_type = 'supplier_payment'
      )
      ORDER BY date DESC, created_at DESC`,
      [businessId, supplierId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Products & Inventory
  // ---------------------------------------------------------------------------

  async listProducts(businessId, { search = '', categoryId = null, lowStockOnly = false } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (search) {
      params.push(`%${search}%`);
      filter += ` AND (p.name ILIKE $${idx} OR p.sku ILIKE $${idx} OR p.barcode ILIKE $${idx})`;
      idx++;
    }
    if (categoryId) {
      params.push(categoryId);
      filter += ` AND p.category_id = $${idx}`;
      idx++;
    }
    if (lowStockOnly) {
      filter += ` AND p.current_stock <= p.min_stock_alert`;
    }

    const { rows } = await getPool().query(
      `SELECT p.*, c.name AS category_name
       FROM biz_products p
       LEFT JOIN biz_product_categories c ON c.id = p.category_id
       WHERE p.business_id = $1 AND p.is_active = true ${filter}
       ORDER BY p.name ASC`,
      params
    );
    return rows;
  },

  async getProductById(clientOrPool, businessId, productId) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM biz_products WHERE business_id = $1 AND id = $2`,
      [businessId, productId]
    );
    return rows[0] || null;
  },

  async createProduct(businessId, { categoryId, name, sku, barcode, unit, purchasePriceMinor, sellingPriceMinor, wholesalePriceMinor, currentStock = 0, minStockAlert = 5 }) {
    const initialQty = Number(currentStock || 0);
    const purchasePrice = BigInt(purchasePriceMinor || 0);
    const initialValuation = (purchasePrice * BigInt(Math.max(0, Math.round(initialQty)))).toString();

    const { rows } = await getPool().query(
      `INSERT INTO biz_products (
        business_id, category_id, name, sku, barcode, unit,
        purchase_price_minor, selling_price_minor, wholesale_price_minor,
        current_stock, min_stock_alert, inventory_valuation_minor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [businessId, categoryId || null, name, sku || '', barcode || '', unit || 'pcs', purchasePrice.toString(), sellingPriceMinor || 0, wholesalePriceMinor || 0, initialQty, minStockAlert, initialValuation]
    );
    return rows[0];
  },

  async updateProduct(businessId, productId, updates) {
    const fields = [];
    const values = [businessId, productId];
    let idx = 3;
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = $${idx++}`);
      values.push(v);
    }
    const { rows } = await getPool().query(
      `UPDATE biz_products SET ${fields.join(', ')}, updated_at = now()
       WHERE business_id = $1 AND id = $2
       RETURNING *`,
      values
    );
    return rows[0];
  },

  async listCategories(businessId) {
    const { rows } = await getPool().query(
      `SELECT * FROM biz_product_categories WHERE business_id = $1 ORDER BY name ASC`,
      [businessId]
    );
    return rows;
  },

  async createCategory(businessId, name, description = '') {
    const { rows } = await getPool().query(
      `INSERT INTO biz_product_categories (business_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [businessId, name, description]
    );
    return rows[0];
  },

  // ---------------------------------------------------------------------------
  // Sales & POS
  // ---------------------------------------------------------------------------

  async listSales(businessId, { limit = 50, offset = 0, status, customerId } = {}) {
    const params = [businessId, limit, offset];
    let filter = '';
    let idx = 4;
    if (status) {
      params.push(status);
      filter += ` AND s.status = $${idx++}`;
    }
    if (customerId) {
      params.push(customerId);
      filter += ` AND s.customer_id = $${idx++}`;
    }

    const { rows } = await getPool().query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
       FROM biz_sales s
       LEFT JOIN biz_customers c ON c.id = s.customer_id
       WHERE s.business_id = $1 ${filter}
       ORDER BY s.date DESC, s.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return rows;
  },

  async getSaleById(businessId, saleId) {
    const { rows } = await getPool().query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
       FROM biz_sales s
       LEFT JOIN biz_customers c ON c.id = s.customer_id
       WHERE s.business_id = $1 AND s.id = $2`,
      [businessId, saleId]
    );
    if (!rows.length) return null;
    const sale = rows[0];

    const itemsRes = await getPool().query(
      `SELECT * FROM biz_sale_items WHERE sale_id = $1`,
      [sale.id]
    );
    sale.items = itemsRes.rows;
    return sale;
  },

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  async listPurchases(businessId, { limit = 50, offset = 0, supplierId } = {}) {
    const params = [businessId, limit, offset];
    let filter = '';
    let idx = 4;
    if (supplierId) {
      params.push(supplierId);
      filter += ` AND p.supplier_id = $${idx++}`;
    }

    const { rows } = await getPool().query(
      `SELECT p.*, s.name AS supplier_name, s.company_name
       FROM biz_purchases p
       LEFT JOIN biz_suppliers s ON s.id = p.supplier_id
       WHERE p.business_id = $1 ${filter}
       ORDER BY p.date DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return rows;
  },

  async getPurchaseById(businessId, purchaseId) {
    const { rows } = await getPool().query(
      `SELECT p.*, s.name AS supplier_name, s.company_name
       FROM biz_purchases p
       LEFT JOIN biz_suppliers s ON s.id = p.supplier_id
       WHERE p.business_id = $1 AND p.id = $2`,
      [businessId, purchaseId]
    );
    if (!rows.length) return null;
    const purchase = rows[0];

    const itemsRes = await getPool().query(
      `SELECT * FROM biz_purchase_items WHERE purchase_id = $1`,
      [purchase.id]
    );
    purchase.items = itemsRes.rows;
    return purchase;
  },

  // ---------------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------------

  async listExpenses(businessId, { limit = 50, offset = 0 } = {}) {
    const { rows } = await getPool().query(
      `SELECT e.*, a.name AS account_name
       FROM biz_expenses e
       LEFT JOIN biz_accounts a ON a.id = e.payment_account_id
       WHERE e.business_id = $1
       ORDER BY e.date DESC, e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Payments (Khata Settlements, Transfers, Owner Equity & Drawings)
  // ---------------------------------------------------------------------------

  async listPayments(businessId, { limit = 50, offset = 0, type } = {}) {
    const params = [businessId, limit, offset];
    let filter = '';
    if (type) {
      params.push(type);
      filter = 'AND p.payment_type = $4';
    }
    const { rows } = await getPool().query(
      `SELECT p.*,
              c.name AS customer_name,
              s.name AS supplier_name,
              fa.name AS from_account_name,
              ta.name AS to_account_name
       FROM biz_payments p
       LEFT JOIN biz_customers c ON c.id = p.customer_id
       LEFT JOIN biz_suppliers s ON s.id = p.supplier_id
       LEFT JOIN biz_accounts fa ON fa.id = p.from_account_id
       LEFT JOIN biz_accounts ta ON ta.id = p.to_account_id
       WHERE p.business_id = $1 ${filter}
       ORDER BY p.date DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Employees & Payroll
  // ---------------------------------------------------------------------------

  async listEmployees(businessId) {
    const { rows } = await getPool().query(
      `SELECT * FROM biz_employees WHERE business_id = $1 ORDER BY name ASC`,
      [businessId]
    );
    return rows;
  },

  async createEmployee(businessId, { name, phone, designation, salaryMinor = 0, joiningDate }) {
    const { rows } = await getPool().query(
      `INSERT INTO biz_employees (business_id, name, phone, designation, salary_minor, joining_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, name, phone || '', designation || '', salaryMinor, joiningDate || null]
    );
    return rows[0];
  },

  async listPayrollRuns(businessId) {
    const { rows } = await getPool().query(
      `SELECT pr.*, a.name AS paid_from_account_name
       FROM biz_payroll_runs pr
       LEFT JOIN biz_accounts a ON a.id = pr.paid_from_account_id
       WHERE pr.business_id = $1
       ORDER BY pr.month DESC`,
      [businessId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Audit Logs
  // ---------------------------------------------------------------------------

  async logAction(businessId, userId, action, entity, entityId = null, details = {}) {
    await getPool().query(
      `INSERT INTO biz_audit_logs (business_id, user_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [businessId, userId, action, entity, entityId, JSON.stringify(details)]
    );
  },

  // ---------------------------------------------------------------------------
  // Dashboard Summary Metrics
  // ---------------------------------------------------------------------------

  async getDashboardSummary(businessId, todayStr) {
    const client = await getPool().connect();
    try {
      // 1. Today's & Month's Sales
      const salesRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN date = $2 THEN total_amount_minor ELSE 0 END), 0) AS today_sales,
           COALESCE(SUM(CASE WHEN date = $2 THEN amount_paid_minor ELSE 0 END), 0) AS today_collected,
           COALESCE(SUM(total_amount_minor), 0) AS month_sales,
           COALESCE(SUM(amount_paid_minor), 0) AS month_collected,
           COUNT(CASE WHEN date = $2 THEN 1 END) AS today_orders_count
         FROM biz_sales
         WHERE business_id = $1 AND date >= date_trunc('month', $2::date) AND date <= $2::date`,
        [businessId, todayStr]
      );
      const sales = salesRes.rows[0];

      // 2. Account Balances: Cash, Bank, Digital Wallets
      const accountsRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN subtype = 'cash' THEN balance_minor ELSE 0 END), 0) AS cash_balance,
           COALESCE(SUM(CASE WHEN subtype = 'bank' THEN balance_minor ELSE 0 END), 0) AS bank_balance,
           COALESCE(SUM(CASE WHEN subtype = 'wallet' THEN balance_minor ELSE 0 END), 0) AS wallet_balance,
           COALESCE(SUM(CASE WHEN subtype = 'inventory' THEN balance_minor ELSE 0 END), 0) AS inventory_valuation,
           COALESCE(SUM(CASE WHEN subtype = 'receivable' THEN balance_minor ELSE 0 END), 0) AS total_receivables,
           COALESCE(SUM(CASE WHEN subtype = 'payable' THEN balance_minor ELSE 0 END), 0) AS total_payables
         FROM biz_accounts
         WHERE business_id = $1 AND is_active = true`,
        [businessId]
      );
      const balances = accountsRes.rows[0];

      // 3. Low stock count
      const stockRes = await client.query(
        `SELECT COUNT(*) AS low_stock_count
         FROM biz_products
         WHERE business_id = $1 AND is_active = true AND current_stock <= min_stock_alert`,
        [businessId]
      );
      const lowStockCount = Number(stockRes.rows[0].low_stock_count);

      // 4. Today's Expenses
      const expRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN date = $2 THEN amount_minor ELSE 0 END), 0) AS today_expenses,
           COALESCE(SUM(amount_minor), 0) AS month_expenses
         FROM biz_expenses
         WHERE business_id = $1 AND date >= date_trunc('month', $2::date) AND date <= $2::date`,
        [businessId, todayStr]
      );
      const expenses = expRes.rows[0];

      return {
        todaySales: sales.today_sales,
        todayCollected: sales.today_collected,
        todayOrdersCount: Number(sales.today_orders_count),
        monthSales: sales.month_sales,
        monthCollected: sales.month_collected,
        todayExpenses: expenses.today_expenses,
        monthExpenses: expenses.month_expenses,
        cashBalance: balances.cash_balance,
        bankBalance: balances.bank_balance,
        walletBalance: balances.wallet_balance,
        inventoryValuation: balances.inventory_valuation,
        totalReceivables: balances.total_receivables,
        totalPayables: balances.total_payables,
        lowStockCount,
      };
    } finally {
      client.release();
    }
  },

  // ---------------------------------------------------------------------------
  // V2: Warehouses & Stock Locations
  // ---------------------------------------------------------------------------

  async listWarehouses(client, businessId) {
    const { rows } = await client.query(
      `SELECT * FROM biz_warehouses WHERE business_id = $1 ORDER BY is_default DESC, name ASC`,
      [businessId]
    );
    return rows;
  },

  async createWarehouse(client, { businessId, branchId, name, code, address, isDefault = false }) {
    if (isDefault) {
      await client.query(`UPDATE biz_warehouses SET is_default = false WHERE business_id = $1`, [businessId]);
    }
    const { rows } = await client.query(
      `INSERT INTO biz_warehouses (business_id, branch_id, name, code, address, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, branchId || null, name, code || 'WH-01', address || '', isDefault]
    );
    return rows[0];
  },

  // ---------------------------------------------------------------------------
  // V2: Multi-Branch Stock Transfers
  // ---------------------------------------------------------------------------

  async createStockTransfer(client, { businessId, fromBranchId, toBranchId, transferNumber, notes, createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO biz_stock_transfers (business_id, from_branch_id, to_branch_id, transfer_number, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, fromBranchId, toBranchId, transferNumber, notes || '', createdBy || null]
    );
    return rows[0];
  },

  async addStockTransferItem(client, { transferId, productId, quantity }) {
    const { rows } = await client.query(
      `INSERT INTO biz_stock_transfer_items (transfer_id, product_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [transferId, productId, quantity]
    );
    return rows[0];
  },

  async listStockTransfers(client, businessId) {
    const { rows } = await client.query(
      `SELECT t.*, b1.name AS from_branch_name, b2.name AS to_branch_name
       FROM biz_stock_transfers t
       JOIN business_branches b1 ON b1.id = t.from_branch_id
       JOIN business_branches b2 ON b2.id = t.to_branch_id
       WHERE t.business_id = $1
       ORDER BY t.created_at DESC`,
      [businessId]
    );
    return rows;
  },

  async getStockTransfer(client, businessId, transferId) {
    const { rows } = await client.query(
      `SELECT t.*, b1.name AS from_branch_name, b2.name AS to_branch_name
       FROM biz_stock_transfers t
       JOIN business_branches b1 ON b1.id = t.from_branch_id
       JOIN business_branches b2 ON b2.id = t.to_branch_id
       WHERE t.id = $1 AND t.business_id = $2`,
      [transferId, businessId]
    );
    if (!rows.length) return null;
    const transfer = rows[0];
    const itemsRes = await client.query(
      `SELECT ti.*, p.name AS product_name, p.unit
       FROM biz_stock_transfer_items ti
       JOIN biz_products p ON p.id = ti.product_id
       WHERE ti.transfer_id = $1`,
      [transferId]
    );
    transfer.items = itemsRes.rows;
    return transfer;
  },

  async updateStockTransferStatus(client, businessId, transferId, status) {
    const completedAt = status === 'received' ? 'now()' : 'NULL';
    const { rows } = await client.query(
      `UPDATE biz_stock_transfers
       SET status = $1, completed_at = ${completedAt}
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [status, transferId, businessId]
    );
    return rows[0];
  },

  // ---------------------------------------------------------------------------
  // V2: Physical Stock Counts & Reconciliation
  // ---------------------------------------------------------------------------

  async createStockCount(client, { businessId, branchId, countNumber, date, notes, createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO biz_stock_counts (business_id, branch_id, count_number, date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, branchId || null, countNumber, date, notes || '', createdBy || null]
    );
    return rows[0];
  },

  async addStockCountItem(client, { stockCountId, productId, expectedQty, countedQty, varianceQty, unitCostMinor, adjustmentValueMinor }) {
    const { rows } = await client.query(
      `INSERT INTO biz_stock_count_items (
         stock_count_id, product_id, expected_qty, counted_qty, variance_qty, unit_cost_minor, adjustment_value_minor
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [stockCountId, productId, expectedQty, countedQty, varianceQty, unitCostMinor, adjustmentValueMinor]
    );
    return rows[0];
  },

  async listStockCounts(client, businessId) {
    const { rows } = await client.query(
      `SELECT c.*, b.name AS branch_name
       FROM biz_stock_counts c
       LEFT JOIN business_branches b ON b.id = c.branch_id
       WHERE c.business_id = $1
       ORDER BY c.date DESC, c.created_at DESC`,
      [businessId]
    );
    return rows;
  },

  async getStockCount(client, businessId, countId) {
    const { rows } = await client.query(
      `SELECT * FROM biz_stock_counts WHERE id = $1 AND business_id = $2`,
      [countId, businessId]
    );
    if (!rows.length) return null;
    const count = rows[0];
    const itemsRes = await client.query(
      `SELECT ci.*, p.name AS product_name, p.sku, p.unit
       FROM biz_stock_count_items ci
       JOIN biz_products p ON p.id = ci.product_id
       WHERE ci.stock_count_id = $1`,
      [countId]
    );
    count.items = itemsRes.rows;
    return count;
  },

  async updateStockCountStatus(client, businessId, countId, status, approvedBy = null) {
    const { rows } = await client.query(
      `UPDATE biz_stock_counts
       SET status = $1, approved_by = COALESCE($2, approved_by)
       WHERE id = $3 AND business_id = $4
       RETURNING *`,
      [status, approvedBy, countId, businessId]
    );
    return rows[0];
  },

  // ---------------------------------------------------------------------------
  // V2: Sales Returns & Refunds
  // ---------------------------------------------------------------------------

  async createSalesReturn(client, {
    businessId, branchId, saleId, returnNumber, customerId, returnDate,
    totalRefundMinor, refundMethod, refundAccountId, reason, restock, createdBy
  }) {
    const { rows } = await client.query(
      `INSERT INTO biz_sales_returns (
         business_id, branch_id, sale_id, return_number, customer_id, return_date,
         total_refund_minor, refund_method, refund_account_id, reason, restock, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        businessId, branchId || null, saleId, returnNumber, customerId || null, returnDate,
        totalRefundMinor, refundMethod, refundAccountId || null, reason || '', restock, createdBy || null
      ]
    );
    return rows[0];
  },

  async addSalesReturnItem(client, { returnId, saleItemId, productId, quantity, unitPriceMinor, refundAmountMinor, condition }) {
    const { rows } = await client.query(
      `INSERT INTO biz_sales_return_items (
         return_id, sale_item_id, product_id, quantity, unit_price_minor, refund_amount_minor, condition
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [returnId, saleItemId || null, productId || null, quantity, unitPriceMinor, refundAmountMinor, condition || 'restockable']
    );
    return rows[0];
  },

  async listSalesReturns(client, businessId) {
    const { rows } = await client.query(
      `SELECT r.*, c.name AS customer_name, s.sale_number
       FROM biz_sales_returns r
       JOIN biz_sales s ON s.id = r.sale_id
       LEFT JOIN biz_customers c ON c.id = r.customer_id
       WHERE r.business_id = $1
       ORDER BY r.return_date DESC, r.created_at DESC`,
      [businessId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // V2: POS Shifts & Cash Drawer Reconciliation
  // ---------------------------------------------------------------------------

  async getActiveShift(client, businessId, cashierId) {
    const { rows } = await client.query(
      `SELECT * FROM biz_pos_shifts
       WHERE business_id = $1 AND cashier_id = $2 AND status = 'open'
       ORDER BY opened_at DESC LIMIT 1`,
      [businessId, cashierId]
    );
    return rows[0] || null;
  },

  async openShift(client, { businessId, branchId, cashierId, openingCashMinor, notes }) {
    const { rows } = await client.query(
      `INSERT INTO biz_pos_shifts (business_id, branch_id, cashier_id, opening_cash_minor, status, notes)
       VALUES ($1, $2, $3, $4, 'open', $5)
       RETURNING *`,
      [businessId, branchId || null, cashierId, openingCashMinor, notes || '']
    );
    return rows[0];
  },

  async closeShift(client, { shiftId, businessId, expectedCashMinor, actualCashMinor, varianceMinor, notes }) {
    const { rows } = await client.query(
      `UPDATE biz_pos_shifts
       SET status = 'closed', closed_at = now(), expected_cash_minor = $1, actual_cash_minor = $2, variance_minor = $3, notes = $4
       WHERE id = $5 AND business_id = $6
       RETURNING *`,
      [expectedCashMinor, actualCashMinor, varianceMinor, notes || '', shiftId, businessId]
    );
    return rows[0];
  },

  async listShifts(client, businessId) {
    const { rows } = await client.query(
      `SELECT s.*, u.name AS cashier_name
       FROM biz_pos_shifts s
       JOIN users u ON u.id = s.cashier_id
       WHERE s.business_id = $1
       ORDER BY s.opened_at DESC`,
      [businessId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // V2: Aging Reports (Receivables & Payables)
  // ---------------------------------------------------------------------------

  async getCustomerAging(client, businessId, asOfDate) {
    const { rows } = await client.query(
      `SELECT
         c.id AS customer_id, c.name, c.phone, c.current_balance_minor,
         COALESCE(SUM(CASE WHEN s.date > ($2::date - INTERVAL '30 days') THEN s.balance_due_minor ELSE 0 END), 0) AS bucket_1_30,
         COALESCE(SUM(CASE WHEN s.date <= ($2::date - INTERVAL '30 days') AND s.date > ($2::date - INTERVAL '60 days') THEN s.balance_due_minor ELSE 0 END), 0) AS bucket_31_60,
         COALESCE(SUM(CASE WHEN s.date <= ($2::date - INTERVAL '60 days') AND s.date > ($2::date - INTERVAL '90 days') THEN s.balance_due_minor ELSE 0 END), 0) AS bucket_61_90,
         COALESCE(SUM(CASE WHEN s.date <= ($2::date - INTERVAL '90 days') THEN s.balance_due_minor ELSE 0 END), 0) AS bucket_over_90
       FROM biz_customers c
       LEFT JOIN biz_sales s ON s.customer_id = c.id AND s.balance_due_minor > 0 AND s.status = 'completed'
       WHERE c.business_id = $1 AND c.is_active = true
       GROUP BY c.id, c.name, c.phone, c.current_balance_minor
       ORDER BY c.current_balance_minor DESC`,
      [businessId, asOfDate]
    );
    return rows;
  },

  async getSupplierAging(client, businessId, asOfDate) {
    const { rows } = await client.query(
      `SELECT
         s.id AS supplier_id, s.name, s.company_name, s.phone, s.current_balance_minor,
         COALESCE(SUM(CASE WHEN p.date > ($2::date - INTERVAL '30 days') THEN p.balance_due_minor ELSE 0 END), 0) AS bucket_1_30,
         COALESCE(SUM(CASE WHEN p.date <= ($2::date - INTERVAL '30 days') AND p.date > ($2::date - INTERVAL '60 days') THEN p.balance_due_minor ELSE 0 END), 0) AS bucket_31_60,
         COALESCE(SUM(CASE WHEN p.date <= ($2::date - INTERVAL '60 days') AND p.date > ($2::date - INTERVAL '90 days') THEN p.balance_due_minor ELSE 0 END), 0) AS bucket_61_90,
         COALESCE(SUM(CASE WHEN p.date <= ($2::date - INTERVAL '90 days') THEN p.balance_due_minor ELSE 0 END), 0) AS bucket_over_90
       FROM biz_suppliers s
       LEFT JOIN biz_purchases p ON p.supplier_id = s.id AND p.balance_due_minor > 0
       WHERE s.business_id = $1 AND s.is_active = true
       GROUP BY s.id, s.name, s.company_name, s.phone, s.current_balance_minor
       ORDER BY s.current_balance_minor DESC`,
      [businessId, asOfDate]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // V2: Employee Attendance & Itemized Payroll Breakdown
  // ---------------------------------------------------------------------------

  async logAttendance(client, { businessId, employeeId, date, status, checkInTime, checkOutTime, hoursWorked, overtimeHours, notes }) {
    const { rows } = await client.query(
      `INSERT INTO biz_employee_attendance (
         business_id, employee_id, date, status, check_in_time, check_out_time, hours_worked, overtime_hours, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (business_id, employee_id, date) DO UPDATE SET
         status = EXCLUDED.status,
         check_in_time = EXCLUDED.check_in_time,
         check_out_time = EXCLUDED.check_out_time,
         hours_worked = EXCLUDED.hours_worked,
         overtime_hours = EXCLUDED.overtime_hours,
         notes = EXCLUDED.notes
       RETURNING *`,
      [businessId, employeeId, date, status, checkInTime || null, checkOutTime || null, hoursWorked || 8.0, overtimeHours || 0.0, notes || '']
    );
    return rows[0];
  },

  async listAttendance(client, businessId, month) {
    const { rows } = await client.query(
      `SELECT a.*, e.name AS employee_name, e.designation
       FROM biz_employee_attendance a
       JOIN biz_employees e ON e.id = a.employee_id
       WHERE a.business_id = $1 AND to_char(a.date, 'YYYY-MM') = $2
       ORDER BY a.date DESC, e.name ASC`,
      [businessId, month]
    );
    return rows;
  },

  async createPayrollItem(client, { payrollRunId, employeeId, baseSalaryMinor, allowancesMinor, deductionsMinor, advanceDeductedMinor, netPayableMinor, status = 'draft' }) {
    const { rows } = await client.query(
      `INSERT INTO biz_payroll_items (
         payroll_run_id, employee_id, base_salary_minor, allowances_minor, deductions_minor, advance_deducted_minor, net_payable_minor, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [payrollRunId, employeeId, baseSalaryMinor, allowancesMinor || 0, deductionsMinor || 0, advanceDeductedMinor || 0, netPayableMinor, status]
    );
    return rows[0];
  },

  async getPayrollItems(client, payrollRunId) {
    const { rows } = await client.query(
      `SELECT pi.*, e.name AS employee_name, e.designation, e.phone
       FROM biz_payroll_items pi
       JOIN biz_employees e ON e.id = pi.employee_id
       WHERE pi.payroll_run_id = $1
       ORDER BY e.name ASC`,
      [payrollRunId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // V2: Budgets
  // ---------------------------------------------------------------------------

  async createBudget(client, { businessId, title, periodType, period, categoryAccountId, targetAmountMinor, notes }) {
    const { rows } = await client.query(
      `INSERT INTO biz_budgets (business_id, title, period_type, period, category_account_id, target_amount_minor, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [businessId, title, periodType || 'monthly', period, categoryAccountId || null, targetAmountMinor, notes || '']
    );
    return rows[0];
  },

  async listBudgets(client, businessId, period = null) {
    const params = [businessId];
    let filter = '';
    if (period) {
      params.push(period);
      filter = 'AND b.period = $2';
    }
    const { rows } = await client.query(
      `SELECT b.*, a.name AS category_name, a.code AS category_code
       FROM biz_budgets b
       LEFT JOIN biz_accounts a ON a.id = b.category_account_id
       WHERE b.business_id = $1 ${filter}
       ORDER BY b.created_at DESC`,
      params
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // V2: In-App Notifications
  // ---------------------------------------------------------------------------

  async createNotification(client, { businessId, userId, type, title, message, link }) {
    const { rows } = await client.query(
      `INSERT INTO biz_notifications (business_id, user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [businessId, userId, type, title, message, link || '']
    );
    return rows[0];
  },

  async listNotifications(client, businessId, unreadOnly = false) {
    const filter = unreadOnly ? 'AND is_read = false' : '';
    const { rows } = await client.query(
      `SELECT * FROM biz_notifications
       WHERE business_id = $1 ${filter}
       ORDER BY created_at DESC LIMIT 50`,
      [businessId]
    );
    return rows;
  },

  async markNotificationRead(client, businessId, notificationId) {
    await client.query(
      `UPDATE biz_notifications SET is_read = true WHERE id = $1 AND business_id = $2`,
      [notificationId, businessId]
    );
  },
};

module.exports = BusinessRepository;

