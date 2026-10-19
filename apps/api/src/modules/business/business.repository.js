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

  async getAccountById(clientOrPool, businessId, accountId) {
    const executor = clientOrPool || getPool();
    const { rows } = await executor.query(
      `SELECT * FROM biz_accounts
       WHERE business_id = $1 AND id = $2`,
      [businessId, accountId]
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

  async updateCustomerBalance(client, customerId, deltaMinor) {
    const { rows } = await client.query(
      `UPDATE biz_customers
       SET current_balance_minor = current_balance_minor + $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [BigInt(deltaMinor).toString(), customerId]
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
        SELECT id, bill_date AS date, 'bill' AS type, bill_number AS reference, total_amount_minor AS credit_minor, amount_paid_minor AS debit_minor, balance_due_minor, notes, created_at
        FROM biz_supplier_bills
        WHERE business_id = $1 AND supplier_id = $2
      ) UNION ALL (
        SELECT id, return_date AS date, 'return' AS type, return_number AS reference, 0 AS credit_minor, total_amount_minor AS debit_minor, 0 AS balance_due_minor, notes, created_at
        FROM biz_purchase_returns
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

  async getProduct(clientOrBusinessId, businessIdOrProductId, maybeProductId) {
    if (maybeProductId !== undefined) {
      return this.getProductById(clientOrBusinessId, businessIdOrProductId, maybeProductId);
    }
    return this.getProductById(getPool(), clientOrBusinessId, businessIdOrProductId);
  },

  async updateProductStock(client, productId, quantity, valuationChangeMinor = 0, operation = 'add') {
    const isAdd = operation === 'add';
    const { rows } = await client.query(
      `UPDATE biz_products
       SET current_stock = CASE WHEN $1 = true THEN current_stock + $2 ELSE GREATEST(0, current_stock - $2) END,
           inventory_valuation_minor = CASE WHEN $1 = true THEN inventory_valuation_minor + $3 ELSE GREATEST(0, inventory_valuation_minor - $3) END,
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [isAdd, quantity, BigInt(valuationChangeMinor || 0).toString(), productId]
    );
    return rows[0] || null;
  },

  async createStockMovement(client, { businessId, branchId, productId, movementType, quantity, unitCostMinor = 0, totalCostMinor = 0, referenceType = null, referenceId = null, reason = '' }) {
    const { rows } = await client.query(
      `INSERT INTO biz_stock_movements (
        business_id, branch_id, product_id, movement_type, quantity,
        unit_cost_minor, total_cost_minor, reference_type, reference_id, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        businessId, branchId || null, productId, movementType, quantity,
        (unitCostMinor || 0).toString(), (totalCostMinor || 0).toString(),
        referenceType || null, referenceId || null, reason || ''
      ]
    );
    return rows[0];
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

  async getSaleById(businessId, saleId, optionalClient = null) {
    const executor = optionalClient || getPool();
    const { rows } = await executor.query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
       FROM biz_sales s
       LEFT JOIN biz_customers c ON c.id = s.customer_id
       WHERE s.business_id = $1 AND s.id = $2`,
      [businessId, saleId]
    );
    if (!rows.length) return null;
    const sale = rows[0];

    const itemsRes = await executor.query(
      `SELECT * FROM biz_sale_items WHERE sale_id = $1`,
      [sale.id]
    );
    sale.items = itemsRes.rows;
    return sale;
  },

  async getSale(clientOrBusinessId, businessIdOrSaleId, maybeSaleId) {
    if (maybeSaleId !== undefined) {
      return this.getSaleById(businessIdOrSaleId, maybeSaleId, clientOrBusinessId);
    }
    return this.getSaleById(clientOrBusinessId, businessIdOrSaleId);
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

  async getPaymentById(businessId, paymentId) {
    const { rows } = await getPool().query(
      `SELECT p.*,
              c.name AS customer_name,
              c.phone AS customer_phone,
              c.address AS customer_address,
              s.name AS supplier_name,
              s.phone AS supplier_phone,
              s.company_name AS supplier_company,
              fa.name AS from_account_name,
              ta.name AS to_account_name
       FROM biz_payments p
       LEFT JOIN biz_customers c ON c.id = p.customer_id
       LEFT JOIN biz_suppliers s ON s.id = p.supplier_id
       LEFT JOIN biz_accounts fa ON fa.id = p.from_account_id
       LEFT JOIN biz_accounts ta ON ta.id = p.to_account_id
       WHERE p.business_id = $1 AND p.id = $2`,
      [businessId, paymentId]
    );
    return rows[0] || null;
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

  async getPayrollRunById(businessId, runId) {
    const { rows } = await getPool().query(
      `SELECT pr.*, a.name AS paid_from_account_name
       FROM biz_payroll_runs pr
       LEFT JOIN biz_accounts a ON a.id = pr.paid_from_account_id
       WHERE pr.business_id = $1 AND pr.id = $2`,
      [businessId, runId]
    );
    if (!rows.length) return null;
    const run = rows[0];
    const itemsRes = await getPool().query(
      `SELECT pi.*, e.name AS employee_name, e.designation, e.phone
       FROM biz_payroll_items pi
       JOIN biz_employees e ON e.id = pi.employee_id
       WHERE pi.payroll_run_id = $1
       ORDER BY e.name ASC`,
      [runId]
    );
    run.items = itemsRes.rows;
    return run;
  },

  async getPayrollItemById(businessId, itemId) {
    const { rows } = await getPool().query(
      `SELECT pi.*, e.name AS employee_name, e.designation, e.phone, e.salary_minor,
              pr.month, pr.status AS run_status, pr.total_amount_minor, pr.payment_method,
              pr.created_at AS run_created_at
       FROM biz_payroll_items pi
       JOIN biz_employees e ON e.id = pi.employee_id
       JOIN biz_payroll_runs pr ON pr.id = pi.payroll_run_id
       WHERE pr.business_id = $1 AND pi.id = $2`,
      [businessId, itemId]
    );
    return rows[0] || null;
  },

  // ---------------------------------------------------------------------------
  // Audit Logs
  // ---------------------------------------------------------------------------

  async logAction(businessId, userId, action, entity, entityId = null, details = {}, optionalClient = null) {
    const db = optionalClient || getPool();
    await db.query(
      `INSERT INTO biz_audit_logs (business_id, user_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [businessId, userId, action, entity, entityId, JSON.stringify(details)]
    );
  },

  async recordAuditLog(clientOrBusinessId, businessIdOrUserId, userIdOrAction, actionOrEntity, entityOrEntityId, entityIdOrDetails = null, details = {}) {
    if (typeof clientOrBusinessId === 'object' && clientOrBusinessId && clientOrBusinessId.query) {
      return this.logAction(businessIdOrUserId, userIdOrAction, actionOrEntity, entityOrEntityId, entityIdOrDetails, details);
    }
    return this.logAction(clientOrBusinessId, businessIdOrUserId, userIdOrAction, actionOrEntity, entityOrEntityId, entityIdOrDetails);
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

  async createPayrollRun(client, { businessId, month, totalSalaryMinor, paidFromAccountId, paymentDate, notes }) {
    const { rows } = await client.query(
      `INSERT INTO biz_payroll_runs (
        business_id, month, total_salary_minor, status,
        paid_from_account_id, payment_date, notes
      ) VALUES ($1, $2, $3, 'draft', $4, $5, $6)
      RETURNING *`,
      [
        businessId, month, (totalSalaryMinor || 0).toString(),
        paidFromAccountId || null, paymentDate || null, notes || ''
      ]
    );
    return rows[0];
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

  // ---------------------------------------------------------------------------
  // Advanced Procurement (V3)
  // ---------------------------------------------------------------------------

  async getNextSequenceNumber(client, businessId, table, column, prefix) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE business_id = $1`,
      [businessId]
    );
    const count = (rows[0]?.count || 0) + 1;
    return `${prefix}${String(count).padStart(5, '0')}`;
  },

  // 1. Purchase Requests
  async createPurchaseRequest(client, businessId, { branchId, requestNumber, requestedBy, department, requiredByDate, priority, notes, items }) {
    const { rows } = await client.query(
      `INSERT INTO biz_purchase_requests (
        business_id, branch_id, request_number, requested_by, department,
        required_by_date, priority, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
      RETURNING *`,
      [businessId, branchId || null, requestNumber, requestedBy, department || '', requiredByDate || null, priority || 'medium', notes || '']
    );
    const pr = rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemRes = await client.query(
        `INSERT INTO biz_purchase_request_items (
          request_id, product_id, product_name, quantity, estimated_cost_minor, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [pr.id, item.productId || null, item.productName, item.quantity, item.estimatedCostMinor || 0, item.notes || '']
      );
      insertedItems.push(itemRes.rows[0]);
    }
    pr.items = insertedItems;
    return pr;
  },

  async listPurchaseRequests(businessId, { status = '', priority = '', limit = 50, offset = 0 } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (status) {
      filter += ` AND pr.status = $${idx++}`;
      params.push(status);
    }
    if (priority) {
      filter += ` AND pr.priority = $${idx++}`;
      params.push(priority);
    }

    params.push(Number(limit) || 50, Number(offset) || 0);

    const { rows } = await getPool().query(
      `SELECT pr.*, u.name AS requester_name, app.name AS approver_name,
              COUNT(pri.id)::int AS item_count,
              COALESCE(SUM(pri.estimated_cost_minor), 0)::bigint AS total_estimated_cost_minor
       FROM biz_purchase_requests pr
       JOIN users u ON u.id = pr.requested_by
       LEFT JOIN users app ON app.id = pr.approved_by
       LEFT JOIN biz_purchase_request_items pri ON pri.request_id = pr.id
       WHERE pr.business_id = $1 ${filter}
       GROUP BY pr.id, u.name, app.name
       ORDER BY pr.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    return rows;
  },

  async getPurchaseRequestById(businessId, requestId) {
    const { rows } = await getPool().query(
      `SELECT pr.*, u.name AS requester_name, app.name AS approver_name
       FROM biz_purchase_requests pr
       JOIN users u ON u.id = pr.requested_by
       LEFT JOIN users app ON app.id = pr.approved_by
       WHERE pr.business_id = $1 AND pr.id = $2`,
      [businessId, requestId]
    );
    if (!rows.length) return null;
    const pr = rows[0];

    const itemsRes = await getPool().query(
      `SELECT * FROM biz_purchase_request_items WHERE request_id = $1 ORDER BY id ASC`,
      [requestId]
    );
    pr.items = itemsRes.rows;
    return pr;
  },

  async updatePurchaseRequestStatus(client, businessId, requestId, status, { approvedBy = null, rejectionReason = '' } = {}) {
    const { rows } = await client.query(
      `UPDATE biz_purchase_requests
       SET status = $1, approved_by = $2, approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
           rejection_reason = $3, updated_at = now()
       WHERE id = $4 AND business_id = $5
       RETURNING *`,
      [status, approvedBy, rejectionReason, requestId, businessId]
    );
    return rows[0] || null;
  },

  // 2. Purchase Orders
  async createPurchaseOrder(client, businessId, { branchId, supplierId, purchaseRequestId, poNumber, date, expectedDeliveryDate, paymentTerms, subtotalMinor, taxMinor, discountMinor, totalAmountMinor, notes, createdBy, items }) {
    const { rows } = await client.query(
      `INSERT INTO biz_purchase_orders (
        business_id, branch_id, supplier_id, purchase_request_id, po_number,
        date, expected_delivery_date, payment_terms, subtotal_minor, tax_minor,
        discount_minor, total_amount_minor, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13, $14)
      RETURNING *`,
      [
        businessId, branchId || null, supplierId, purchaseRequestId || null, poNumber,
        date, expectedDeliveryDate || null, paymentTerms || 'net_30',
        subtotalMinor.toString(), taxMinor.toString(), discountMinor.toString(),
        totalAmountMinor.toString(), notes || '', createdBy
      ]
    );
    const po = rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemRes = await client.query(
        `INSERT INTO biz_purchase_order_items (
          po_id, product_id, product_name, quantity_ordered, unit_price_minor,
          tax_minor, discount_minor, line_total_minor
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          po.id, item.productId, item.productName, item.quantityOrdered,
          item.unitPriceMinor.toString(), (item.taxMinor || 0).toString(),
          (item.discountMinor || 0).toString(), item.lineTotalMinor.toString()
        ]
      );
      insertedItems.push(itemRes.rows[0]);
    }
    po.items = insertedItems;
    return po;
  },

  async listPurchaseOrders(businessId, { status = '', supplierId = '', limit = 50, offset = 0 } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (status) {
      filter += ` AND po.status = $${idx++}`;
      params.push(status);
    }
    if (supplierId) {
      filter += ` AND po.supplier_id = $${idx++}`;
      params.push(supplierId);
    }

    params.push(Number(limit) || 50, Number(offset) || 0);

    const { rows } = await getPool().query(
      `SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone,
              u.name AS creator_name, app.name AS approver_name,
              COUNT(poi.id)::int AS item_count
       FROM biz_purchase_orders po
       JOIN biz_suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
       LEFT JOIN users app ON app.id = po.approved_by
       LEFT JOIN biz_purchase_order_items poi ON poi.po_id = po.id
       WHERE po.business_id = $1 ${filter}
       GROUP BY po.id, s.name, s.phone, u.name, app.name
       ORDER BY po.date DESC, po.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    return rows;
  },

  async getPurchaseOrderById(businessId, poId) {
    const { rows } = await getPool().query(
      `SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone, s.company_name AS supplier_company,
              u.name AS creator_name, app.name AS approver_name
       FROM biz_purchase_orders po
       JOIN biz_suppliers s ON s.id = po.supplier_id
       LEFT JOIN users u ON u.id = po.created_by
       LEFT JOIN users app ON app.id = po.approved_by
       WHERE po.business_id = $1 AND po.id = $2`,
      [businessId, poId]
    );
    if (!rows.length) return null;
    const po = rows[0];

    const itemsRes = await getPool().query(
      `SELECT poi.*, p.sku, p.unit
       FROM biz_purchase_order_items poi
       JOIN biz_products p ON p.id = poi.product_id
       WHERE poi.po_id = $1
       ORDER BY poi.id ASC`,
      [poId]
    );
    po.items = itemsRes.rows;
    return po;
  },

  async updatePurchaseOrderStatus(client, businessId, poId, status, { approvedBy = null, rejectionReason = '' } = {}) {
    const { rows } = await client.query(
      `UPDATE biz_purchase_orders
       SET status = $1, approved_by = $2, approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
           rejection_reason = $3, updated_at = now()
       WHERE id = $4 AND business_id = $5
       RETURNING *`,
      [status, approvedBy, rejectionReason, poId, businessId]
    );
    return rows[0] || null;
  },

  async updatePoItemReceivedQty(client, poItemId, additionalReceived) {
    await client.query(
      `UPDATE biz_purchase_order_items
       SET quantity_received = quantity_received + $1
       WHERE id = $2`,
      [additionalReceived, poItemId]
    );
  },

  async updatePoItemBilledQty(client, poItemId, additionalBilled) {
    await client.query(
      `UPDATE biz_purchase_order_items
       SET quantity_billed = quantity_billed + $1
       WHERE id = $2`,
      [additionalBilled, poItemId]
    );
  },

  // 3. Goods Received Notes (GRN)
  async createGrn(client, businessId, { branchId, warehouseId, poId, supplierId, grnNumber, receiveDate, deliveryChallanNumber, totalReceivedValueMinor, notes, receivedBy, items }) {
    const { rows } = await client.query(
      `INSERT INTO biz_grns (
        business_id, branch_id, warehouse_id, po_id, supplier_id,
        grn_number, receive_date, delivery_challan_number, total_received_value_minor,
        status, notes, received_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'received', $10, $11)
      RETURNING *`,
      [
        businessId, branchId || null, warehouseId || null, poId, supplierId,
        grnNumber, receiveDate, deliveryChallanNumber || '',
        totalReceivedValueMinor.toString(), notes || '', receivedBy
      ]
    );
    const grn = rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemRes = await client.query(
        `INSERT INTO biz_grn_items (
          grn_id, po_item_id, product_id, quantity_received, unit_cost_minor,
          total_cost_minor, batch_number, expiry_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          grn.id, item.poItemId, item.productId, item.quantityReceived,
          item.unitCostMinor.toString(), item.totalCostMinor.toString(),
          item.batchNumber || '', item.expiryDate || null
        ]
      );
      insertedItems.push(itemRes.rows[0]);
    }
    grn.items = insertedItems;
    return grn;
  },

  async listGrns(businessId, { poId = '', supplierId = '', limit = 50, offset = 0 } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (poId) {
      filter += ` AND g.po_id = $${idx++}`;
      params.push(poId);
    }
    if (supplierId) {
      filter += ` AND g.supplier_id = $${idx++}`;
      params.push(supplierId);
    }

    params.push(Number(limit) || 50, Number(offset) || 0);

    const { rows } = await getPool().query(
      `SELECT g.*, s.name AS supplier_name, po.po_number, u.name AS receiver_name,
              COUNT(gi.id)::int AS item_count
       FROM biz_grns g
       JOIN biz_suppliers s ON s.id = g.supplier_id
       JOIN biz_purchase_orders po ON po.id = g.po_id
       LEFT JOIN users u ON u.id = g.received_by
       LEFT JOIN biz_grn_items gi ON gi.grn_id = g.id
       WHERE g.business_id = $1 ${filter}
       GROUP BY g.id, s.name, po.po_number, u.name
       ORDER BY g.receive_date DESC, g.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    return rows;
  },

  async getGrnById(businessId, grnId) {
    const { rows } = await getPool().query(
      `SELECT g.*, s.name AS supplier_name, po.po_number, u.name AS receiver_name
       FROM biz_grns g
       JOIN biz_suppliers s ON s.id = g.supplier_id
       JOIN biz_purchase_orders po ON po.id = g.po_id
       LEFT JOIN users u ON u.id = g.received_by
       WHERE g.business_id = $1 AND g.id = $2`,
      [businessId, grnId]
    );
    if (!rows.length) return null;
    const grn = rows[0];

    const itemsRes = await getPool().query(
      `SELECT gi.*, p.name AS product_name, p.sku, p.unit
       FROM biz_grn_items gi
       JOIN biz_products p ON p.id = gi.product_id
       WHERE gi.grn_id = $1
       ORDER BY gi.id ASC`,
      [grnId]
    );
    grn.items = itemsRes.rows;
    return grn;
  },

  // 4. Supplier Bills
  async createSupplierBill(client, businessId, { supplierId, poId, grnId, billNumber, supplierInvoiceNumber, billDate, dueDate, subtotalMinor, taxMinor, discountMinor, totalAmountMinor, amountPaidMinor, balanceDueMinor, notes, createdBy, items }) {
    const status = balanceDueMinor === 0n ? 'paid' : (amountPaidMinor > 0n ? 'partially_paid' : 'unpaid');
    const { rows } = await client.query(
      `INSERT INTO biz_supplier_bills (
        business_id, supplier_id, po_id, grn_id, bill_number, supplier_invoice_number,
        bill_date, due_date, subtotal_minor, tax_minor, discount_minor,
        total_amount_minor, amount_paid_minor, balance_due_minor, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        businessId, supplierId, poId || null, grnId || null, billNumber,
        supplierInvoiceNumber || '', billDate, dueDate,
        subtotalMinor.toString(), taxMinor.toString(), discountMinor.toString(),
        totalAmountMinor.toString(), amountPaidMinor.toString(), balanceDueMinor.toString(),
        status, notes || '', createdBy
      ]
    );
    const bill = rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemRes = await client.query(
        `INSERT INTO biz_supplier_bill_items (
          bill_id, product_id, po_item_id, description, quantity,
          unit_price_minor, tax_minor, line_total_minor
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          bill.id, item.productId || null, item.poItemId || null, item.description || '',
          item.quantity, item.unitPriceMinor.toString(), (item.taxMinor || 0).toString(),
          item.lineTotalMinor.toString()
        ]
      );
      insertedItems.push(itemRes.rows[0]);
    }
    bill.items = insertedItems;
    return bill;
  },

  async listSupplierBills(businessId, { supplierId = '', status = '', limit = 50, offset = 0 } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (supplierId) {
      filter += ` AND sb.supplier_id = $${idx++}`;
      params.push(supplierId);
    }
    if (status) {
      filter += ` AND sb.status = $${idx++}`;
      params.push(status);
    }

    params.push(Number(limit) || 50, Number(offset) || 0);

    const { rows } = await getPool().query(
      `SELECT sb.*, s.name AS supplier_name, s.company_name AS supplier_company,
              po.po_number, g.grn_number, u.name AS creator_name
       FROM biz_supplier_bills sb
       JOIN biz_suppliers s ON s.id = sb.supplier_id
       LEFT JOIN biz_purchase_orders po ON po.id = sb.po_id
       LEFT JOIN biz_grns g ON g.id = sb.grn_id
       LEFT JOIN users u ON u.id = sb.created_by
       WHERE sb.business_id = $1 ${filter}
       ORDER BY sb.bill_date DESC, sb.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    return rows;
  },

  async getSupplierBillById(businessId, billId) {
    const { rows } = await getPool().query(
      `SELECT sb.*, s.name AS supplier_name, s.company_name AS supplier_company,
              s.phone AS supplier_phone, po.po_number, g.grn_number, u.name AS creator_name
       FROM biz_supplier_bills sb
       JOIN biz_suppliers s ON s.id = sb.supplier_id
       LEFT JOIN biz_purchase_orders po ON po.id = sb.po_id
       LEFT JOIN biz_grns g ON g.id = sb.grn_id
       LEFT JOIN users u ON u.id = sb.created_by
       WHERE sb.business_id = $1 AND sb.id = $2`,
      [businessId, billId]
    );
    if (!rows.length) return null;
    const bill = rows[0];

    const itemsRes = await getPool().query(
      `SELECT sbi.*, p.name AS product_name, p.sku
       FROM biz_supplier_bill_items sbi
       LEFT JOIN biz_products p ON p.id = sbi.product_id
       WHERE sbi.bill_id = $1
       ORDER BY sbi.id ASC`,
      [billId]
    );
    bill.items = itemsRes.rows;
    return bill;
  },

  async allocateSupplierPayment(client, paymentId, billId, allocatedAmountMinor) {
    const { rows } = await client.query(
      `INSERT INTO biz_supplier_payment_allocations (payment_id, bill_id, allocated_amount_minor)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [paymentId, billId, allocatedAmountMinor.toString()]
    );
    return rows[0];
  },

  async updateSupplierBillPayment(client, businessId, billId, paymentMinor) {
    const payBig = BigInt(paymentMinor);
    const { rows } = await client.query(
      `UPDATE biz_supplier_bills
       SET amount_paid_minor = amount_paid_minor + $1,
           balance_due_minor = GREATEST(0, balance_due_minor - $1),
           status = CASE
             WHEN (balance_due_minor - $1) <= 0 THEN 'paid'
             ELSE 'partially_paid'
           END,
           updated_at = now()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [payBig.toString(), billId, businessId]
    );
    return rows[0] || null;
  },

  // 5. Purchase Returns
  async createPurchaseReturn(client, businessId, { branchId, supplierId, poId, billId, returnNumber, returnDate, totalAmountMinor, refundMethod, refundAccountId, reason, notes, createdBy, items }) {
    const { rows } = await client.query(
      `INSERT INTO biz_purchase_returns (
        business_id, branch_id, supplier_id, po_id, bill_id, return_number,
        return_date, total_amount_minor, refund_method, refund_account_id,
        reason, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        businessId, branchId || null, supplierId, poId || null, billId || null,
        returnNumber, returnDate, totalAmountMinor.toString(),
        refundMethod || 'credit_note', refundAccountId || null,
        reason || '', notes || '', createdBy
      ]
    );
    const prn = rows[0];

    const insertedItems = [];
    for (const item of items) {
      const itemRes = await client.query(
        `INSERT INTO biz_purchase_return_items (
          return_id, product_id, quantity, unit_cost_minor, line_total_minor
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [prn.id, item.productId, item.quantity, item.unitCostMinor.toString(), item.lineTotalMinor.toString()]
      );
      insertedItems.push(itemRes.rows[0]);
    }
    prn.items = insertedItems;
    return prn;
  },

  async listPurchaseReturns(businessId, { supplierId = '', limit = 50, offset = 0 } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (supplierId) {
      filter += ` AND prn.supplier_id = $${idx++}`;
      params.push(supplierId);
    }

    params.push(Number(limit) || 50, Number(offset) || 0);

    const { rows } = await getPool().query(
      `SELECT prn.*, s.name AS supplier_name, s.company_name AS supplier_company,
              po.po_number, sb.bill_number, u.name AS creator_name,
              COUNT(pri.id)::int AS item_count
       FROM biz_purchase_returns prn
       JOIN biz_suppliers s ON s.id = prn.supplier_id
       LEFT JOIN biz_purchase_orders po ON po.id = prn.po_id
       LEFT JOIN biz_supplier_bills sb ON sb.id = prn.bill_id
       LEFT JOIN users u ON u.id = prn.created_by
       LEFT JOIN biz_purchase_return_items pri ON pri.return_id = prn.id
       WHERE prn.business_id = $1 ${filter}
       GROUP BY prn.id, s.name, s.company_name, po.po_number, sb.bill_number, u.name
       ORDER BY prn.return_date DESC, prn.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    return rows;
  },

  async getPurchaseReturnById(businessId, returnId) {
    const { rows } = await getPool().query(
      `SELECT prn.*, s.name AS supplier_name, s.company_name AS supplier_company,
              po.po_number, sb.bill_number, u.name AS creator_name
       FROM biz_purchase_returns prn
       JOIN biz_suppliers s ON s.id = prn.supplier_id
       LEFT JOIN biz_purchase_orders po ON po.id = prn.po_id
       LEFT JOIN biz_supplier_bills sb ON sb.id = prn.bill_id
       LEFT JOIN users u ON u.id = prn.created_by
       WHERE prn.business_id = $1 AND prn.id = $2`,
      [businessId, returnId]
    );
    if (!rows.length) return null;
    const prn = rows[0];

    const itemsRes = await getPool().query(
      `SELECT pri.*, p.name AS product_name, p.sku, p.unit
       FROM biz_purchase_return_items pri
       JOIN biz_products p ON p.id = pri.product_id
       WHERE pri.return_id = $1
       ORDER BY pri.id ASC`,
      [returnId]
    );
    prn.items = itemsRes.rows;
    return prn;
  },

  // ---------------------------------------------------------------------------
  // Recurring Business Expenses (V3)
  // ---------------------------------------------------------------------------

  async createRecurringExpense(client, businessId, { branchId, supplierId, categoryAccountId, paymentAccountId, title, category, vendor, amountMinor, frequency, intervalCount = 1, startDate, endDate = null, nextDueDate, dueDaysAfter = 0, autoPay = false, paymentMethod = 'unpaid', notes = '', createdBy }) {
    const { rows } = await client.query(
      `INSERT INTO biz_recurring_expenses (
        business_id, branch_id, supplier_id, category_account_id, payment_account_id,
        title, category, vendor, amount_minor, frequency, interval_count,
        start_date, end_date, next_due_date, due_days_after, auto_pay,
        payment_method, status, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'active', $18, $19)
      RETURNING *`,
      [
        businessId, branchId || null, supplierId || null, categoryAccountId, paymentAccountId || null,
        title, category, vendor || '', BigInt(amountMinor).toString(), frequency, Number(intervalCount) || 1,
        startDate, endDate || null, nextDueDate, Number(dueDaysAfter) || 0, Boolean(autoPay),
        paymentMethod || 'unpaid', notes || '', createdBy
      ]
    );
    return rows[0];
  },

  async getRecurringExpenseById(businessId, expenseId) {
    const { rows } = await getPool().query(
      `SELECT re.*, b.name AS branch_name, s.name AS supplier_name,
              ca.name AS category_account_name, pa.name AS payment_account_name,
              u.name AS creator_name
       FROM biz_recurring_expenses re
       LEFT JOIN business_branches b ON b.id = re.branch_id
       LEFT JOIN biz_suppliers s ON s.id = re.supplier_id
       LEFT JOIN biz_accounts ca ON ca.id = re.category_account_id
       LEFT JOIN biz_accounts pa ON pa.id = re.payment_account_id
       LEFT JOIN users u ON u.id = re.created_by
       WHERE re.business_id = $1 AND re.id = $2`,
      [businessId, expenseId]
    );
    return rows[0] || null;
  },

  async listRecurringExpenses(businessId, { status = '', supplierId = '', frequency = '', limit = 50, offset = 0 } = {}) {
    const params = [businessId];
    let filter = '';
    let idx = 2;

    if (status) {
      filter += ` AND re.status = $${idx++}`;
      params.push(status);
    }
    if (supplierId) {
      filter += ` AND re.supplier_id = $${idx++}`;
      params.push(supplierId);
    }
    if (frequency) {
      filter += ` AND re.frequency = $${idx++}`;
      params.push(frequency);
    }

    params.push(Number(limit) || 50, Number(offset) || 0);

    const { rows } = await getPool().query(
      `SELECT re.*, b.name AS branch_name, s.name AS supplier_name,
              ca.name AS category_account_name, pa.name AS payment_account_name,
              COUNT(reo.id)::int AS occurrences_count,
              MAX(reo.occurrence_date) AS last_occurrence_date
       FROM biz_recurring_expenses re
       LEFT JOIN business_branches b ON b.id = re.branch_id
       LEFT JOIN biz_suppliers s ON s.id = re.supplier_id
       LEFT JOIN biz_accounts ca ON ca.id = re.category_account_id
       LEFT JOIN biz_accounts pa ON pa.id = re.payment_account_id
       LEFT JOIN biz_recurring_expense_occurrences reo ON reo.recurring_expense_id = re.id
       WHERE re.business_id = $1 ${filter}
       GROUP BY re.id, b.name, s.name, ca.name, pa.name
       ORDER BY re.next_due_date ASC, re.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    return rows;
  },

  async updateRecurringExpense(client, businessId, expenseId, updates) {
    const fields = [];
    const values = [businessId, expenseId];
    let idx = 3;

    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = $${idx++}`);
      values.push(val);
    }
    fields.push(`updated_at = now()`);

    const { rows } = await client.query(
      `UPDATE biz_recurring_expenses
       SET ${fields.join(', ')}
       WHERE business_id = $1 AND id = $2
       RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async updateRecurringExpenseStatus(client, businessId, expenseId, status) {
    const { rows } = await client.query(
      `UPDATE biz_recurring_expenses
       SET status = $1, updated_at = now()
       WHERE business_id = $2 AND id = $3
       RETURNING *`,
      [status, businessId, expenseId]
    );
    return rows[0] || null;
  },

  async getDueRecurringExpenses(clientOrPool, businessId, asOfDateStr) {
    const executor = clientOrPool || getPool();
    const { rows } = await executor.query(
      `SELECT * FROM biz_recurring_expenses
       WHERE business_id = $1 AND status = 'active' AND next_due_date <= $2
       ORDER BY next_due_date ASC`,
      [businessId, asOfDateStr]
    );
    return rows;
  },

  async createRecurringOccurrence(client, { businessId, recurringExpenseId, expenseId = null, periodKey, occurrenceDate, dueDate, amountMinor, status = 'generated', errorMessage = '' }) {
    const { rows } = await client.query(
      `INSERT INTO biz_recurring_expense_occurrences (
        business_id, recurring_expense_id, expense_id, period_key,
        occurrence_date, due_date, amount_minor, status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        businessId, recurringExpenseId, expenseId, periodKey,
        occurrenceDate, dueDate, BigInt(amountMinor).toString(), status, errorMessage || ''
      ]
    );
    return rows[0];
  },

  async getRecurringOccurrence(clientOrPool, businessId, recurringExpenseId, periodKey) {
    const executor = clientOrPool || getPool();
    const { rows } = await executor.query(
      `SELECT * FROM biz_recurring_expense_occurrences
       WHERE business_id = $1 AND recurring_expense_id = $2 AND period_key = $3`,
      [businessId, recurringExpenseId, periodKey]
    );
    return rows[0] || null;
  },

  async listRecurringOccurrences(businessId, recurringExpenseId, { limit = 50, offset = 0 } = {}) {
    const { rows } = await getPool().query(
      `SELECT reo.*, e.title AS expense_title, e.payment_method, e.status AS expense_status
       FROM biz_recurring_expense_occurrences reo
       LEFT JOIN biz_expenses e ON e.id = reo.expense_id
       WHERE reo.business_id = $1 AND reo.recurring_expense_id = $2
       ORDER BY reo.occurrence_date DESC
       LIMIT $3 OFFSET $4`,
      [businessId, recurringExpenseId, Number(limit) || 50, Number(offset) || 0]
    );
    return rows;
  },

  async getUpcomingRecurringExpenses(businessId, daysAhead = 7) {
    const { rows } = await getPool().query(
      `SELECT re.*, s.name AS supplier_name, ca.name AS category_account_name
       FROM biz_recurring_expenses re
       LEFT JOIN biz_suppliers s ON s.id = re.supplier_id
       LEFT JOIN biz_accounts ca ON ca.id = re.category_account_id
       WHERE re.business_id = $1 AND re.status = 'active'
         AND re.next_due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($2 || ' days')::interval)
       ORDER BY re.next_due_date ASC`,
      [businessId, daysAhead]
    );
    return rows;
  },

  async getOverdueRecurringExpenses(businessId) {
    const { rows } = await getPool().query(
      `SELECT re.*, s.name AS supplier_name, ca.name AS category_account_name
       FROM biz_recurring_expenses re
       LEFT JOIN biz_suppliers s ON s.id = re.supplier_id
       LEFT JOIN biz_accounts ca ON ca.id = re.category_account_id
       WHERE re.business_id = $1 AND re.status = 'active'
         AND re.next_due_date < CURRENT_DATE
       ORDER BY re.next_due_date ASC`,
      [businessId]
    );
    return rows;
  },

  // ---------------------------------------------------------------------------
  // Offline POS Synchronization (V3)
  // ---------------------------------------------------------------------------

  async getOfflineSyncRecord(client, businessId, clientTxId) {
    const db = client || getPool();
    const { rows } = await db.query(
      `SELECT * FROM biz_offline_sync_log
       WHERE business_id = $1 AND client_tx_id = $2`,
      [businessId, clientTxId]
    );
    return rows[0] || null;
  },

  async recordOfflineSync(client, {
    businessId,
    userId,
    clientTxId,
    saleId = null,
    status,
    conflictCode = null,
    conflictReason = null,
    requestPayload = {},
    responsePayload = {},
    deviceFingerprint = '',
    offlineCreatedAt,
  }) {
    const db = client || getPool();
    const { rows } = await db.query(
      `INSERT INTO biz_offline_sync_log (
        business_id, user_id, client_tx_id, sale_id, status,
        conflict_code, conflict_reason, request_payload, response_payload,
        device_fingerprint, offline_created_at, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      ON CONFLICT (business_id, client_tx_id) DO UPDATE SET
        sale_id = EXCLUDED.sale_id,
        status = EXCLUDED.status,
        conflict_code = EXCLUDED.conflict_code,
        conflict_reason = EXCLUDED.conflict_reason,
        response_payload = EXCLUDED.response_payload,
        synced_at = now()
      RETURNING *`,
      [
        businessId,
        userId || null,
        clientTxId,
        saleId,
        status,
        conflictCode,
        conflictReason,
        JSON.stringify(requestPayload || {}),
        JSON.stringify(responsePayload || {}),
        deviceFingerprint || '',
        offlineCreatedAt || new Date().toISOString(),
      ]
    );
    return rows[0];
  },

  async listOfflineSyncHistory(businessId, limit = 50) {
    const { rows } = await getPool().query(
      `SELECT osl.*, u.full_name AS cashier_name, s.sale_number, s.total_amount_minor
       FROM biz_offline_sync_log osl
       LEFT JOIN users u ON u.id = osl.user_id
       LEFT JOIN biz_sales s ON s.id = osl.sale_id
       WHERE osl.business_id = $1
       ORDER BY osl.synced_at DESC
       LIMIT $2`,
      [businessId, Number(limit) || 50]
    );
    return rows;
  },

  async getSaleByClientTxId(client, businessId, clientTxId) {
    const db = client || getPool();
    const { rows } = await db.query(
      `SELECT s.*, c.name AS customer_name
       FROM biz_sales s
       LEFT JOIN biz_customers c ON c.id = s.customer_id
       WHERE s.business_id = $1 AND s.client_tx_id = $2`,
      [businessId, clientTxId]
    );
    return rows[0] || null;
  },
};

module.exports = BusinessRepository;

