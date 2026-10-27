/**
 * Secure Client-Side IndexedDB Storage Service for HisabKi Kitab Offline POS.
 *
 * Provides resilient, tenant-isolated local storage for:
 * 1. Authorized product catalog & pricing
 * 2. Cached customer khata records
 * 3. Offline queued transactions awaiting authoritative server sync
 * 4. Synchronization audit history
 *
 * Implements graceful fallback when IndexedDB is unavailable (SSR / environments without IDB).
 */

const DB_NAME = 'HKK_POS_OFFLINE_DB';
const DB_VERSION = 1;

let dbInstance = null;

// Memory fallback store if IndexedDB is unavailable
const memoryFallback = {
  products: new Map(),
  customers: new Map(),
  sales: new Map(),
  history: [],
};

const hasIndexedDb = () =>
  typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;

/**
 * Initializes and returns the IndexedDB database instance.
 */
export async function getDb() {
  if (!hasIndexedDb()) return null;
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Cached Products Store
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('by_business', 'business_id', { unique: false });
        productStore.createIndex('by_barcode', 'barcode', { unique: false });
      }

      // 2. Cached Customers Store
      if (!db.objectStoreNames.contains('customers')) {
        const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
        customerStore.createIndex('by_business', 'business_id', { unique: false });
      }

      // 3. Queued Offline Sales Store
      if (!db.objectStoreNames.contains('offline_sales')) {
        const salesStore = db.createObjectStore('offline_sales', { keyPath: 'clientTxId' });
        salesStore.createIndex('by_business', 'businessId', { unique: false });
        salesStore.createIndex('by_sync_status', 'syncStatus', { unique: false });
        salesStore.createIndex('by_created_at', 'offlineCreatedAt', { unique: false });
      }

      // 4. Local Synchronization Audit History
      if (!db.objectStoreNames.contains('sync_history')) {
        const historyStore = db.createObjectStore('sync_history', { keyPath: 'id', autoIncrement: true });
        historyStore.createIndex('by_business', 'businessId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn('[Offline POS Storage] IndexedDB error, using memory fallback:', event.target.error);
      resolve(null);
    };
  });
}

/**
 * Checks whether durable client storage (IndexedDB) is available and functional.
 * Returns false if in private mode with blocked storage, SSR, or quota exceeded.
 */
export async function isDurableStorageAvailable() {
  if (!hasIndexedDb()) return false;
  try {
    const db = await getDb();
    return db !== null;
  } catch {
    return false;
  }
}

/**
 * Caches authorized products and customers for the active business.
 * Sanitizes customer records to protect sensitive data in local storage.
 */
export async function cacheCatalog(businessId, products = [], customers = []) {
  if (!businessId) return;

  // Protect locally cached customer information: keep only operational khata fields
  const sanitizedCustomers = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    current_balance_minor: c.current_balance_minor || 0,
    credit_limit_minor: c.credit_limit_minor || 0,
    is_active: c.is_active !== false,
  }));

  const db = await getDb();

  if (!db) {
    products.forEach((p) => memoryFallback.products.set(`${businessId}:${p.id}`, { ...p, business_id: businessId }));
    sanitizedCustomers.forEach((c) => memoryFallback.customers.set(`${businessId}:${c.id}`, { ...c, business_id: businessId }));
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'customers'], 'readwrite');
    const prodStore = tx.objectStore('products');
    const custStore = tx.objectStore('customers');

    products.forEach((p) => prodStore.put({ ...p, business_id: businessId }));
    sanitizedCustomers.forEach((c) => custStore.put({ ...c, business_id: businessId }));

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves cached products for a business with optional search and category filters.
 */
export async function getCachedProducts(businessId, search = '', categoryId = 'all') {
  if (!businessId) return [];
  const db = await getDb();

  let allProducts = [];
  if (!db) {
    allProducts = Array.from(memoryFallback.products.values()).filter(
      (p) => p.business_id === businessId && p.is_active !== false
    );
  } else {
    allProducts = await new Promise((resolve) => {
      const tx = db.transaction('products', 'readonly');
      const store = tx.objectStore('products');
      const index = store.index('by_business');
      const req = index.getAll(businessId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  const s = search.trim().toLowerCase();
  return allProducts.filter((p) => {
    const matchesCat = categoryId === 'all' || p.category_id === categoryId;
    const matchesSearch =
      !s ||
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.barcode && p.barcode.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s));
    return matchesCat && matchesSearch;
  });
}

/**
 * Retrieves cached customers for a business with optional search.
 */
export async function getCachedCustomers(businessId, search = '') {
  if (!businessId) return [];
  const db = await getDb();

  let allCustomers = [];
  if (!db) {
    allCustomers = Array.from(memoryFallback.customers.values()).filter(
      (c) => c.business_id === businessId && c.is_active !== false
    );
  } else {
    allCustomers = await new Promise((resolve) => {
      const tx = db.transaction('customers', 'readonly');
      const store = tx.objectStore('customers');
      const index = store.index('by_business');
      const req = index.getAll(businessId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  const s = search.trim().toLowerCase();
  return allCustomers.filter((c) => {
    return (
      !s ||
      (c.name && c.name.toLowerCase().includes(s)) ||
      (c.phone && c.phone.toLowerCase().includes(s))
    );
  });
}

/**
 * Queues an offline sale in the local transaction queue.
 */
export async function queueOfflineSale(saleData) {
  const clientTxId = saleData.clientTxId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const record = {
    ...saleData,
    clientTxId,
    offlineCreatedAt: saleData.offlineCreatedAt || new Date().toISOString(),
    syncStatus: 'pending_sync', // 'pending_sync' | 'syncing' | 'synced' | 'conflict' | 'failed'
    retryCount: 0,
    lastSyncAttempt: null,
    serverSaleId: null,
    serverSaleNumber: null,
    conflictCode: null,
    conflictReason: null,
  };

  const db = await getDb();
  if (!db) {
    memoryFallback.sales.set(clientTxId, record);
    return record;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieves all sales in the queue for a business, optionally partitioned by user.
 */
export async function getAllQueuedSales(businessId, userId = null) {
  if (!businessId) return [];
  const db = await getDb();

  if (!db) {
    return Array.from(memoryFallback.sales.values())
      .filter((s) => s.businessId === businessId && (!userId || !s.userId || s.userId === userId))
      .sort((a, b) => new Date(b.offlineCreatedAt) - new Date(a.offlineCreatedAt));
  }

  return new Promise((resolve) => {
    const tx = db.transaction('offline_sales', 'readonly');
    const store = tx.objectStore('offline_sales');
    const index = store.index('by_business');
    const req = index.getAll(businessId);
    req.onsuccess = () => {
      let records = req.result || [];
      if (userId) {
        records = records.filter((s) => !s.userId || s.userId === userId);
      }
      records.sort((a, b) => new Date(b.offlineCreatedAt) - new Date(a.offlineCreatedAt));
      resolve(records);
    };
    req.onerror = () => resolve([]);
  });
}

/**
 * Retrieves only pending (unsynced or conflict) sales.
 */
export async function getPendingSales(businessId, userId = null) {
  const all = await getAllQueuedSales(businessId, userId);
  return all.filter((s) => s.syncStatus === 'pending_sync' || s.syncStatus === 'conflict' || s.syncStatus === 'failed');
}

/**
 * Updates status and metadata of an offline sale.
 */
export async function updateSaleStatus(clientTxId, updates) {
  const db = await getDb();

  if (!db) {
    const existing = memoryFallback.sales.get(clientTxId);
    if (existing) {
      const updated = { ...existing, ...updates, lastSyncAttempt: new Date().toISOString() };
      memoryFallback.sales.set(clientTxId, updated);
      return updated;
    }
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const getReq = store.get(clientTxId);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (!record) return resolve(null);
      const updated = { ...record, ...updates, lastSyncAttempt: new Date().toISOString() };
      store.put(updated);
      resolve(updated);
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Removes an offline sale from local storage.
 */
export async function removeOfflineSale(clientTxId) {
  const db = await getDb();
  if (!db) {
    memoryFallback.sales.delete(clientTxId);
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    const store = tx.objectStore('offline_sales');
    const req = store.delete(clientTxId);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Audited discard of an offline transaction: records an audit entry before removal.
 */
export async function discardOfflineSale(clientTxId, reason = 'Operator discarded transaction', auditInfo = {}) {
  const db = await getDb();
  let saleRecord = null;
  if (!db) {
    saleRecord = memoryFallback.sales.get(clientTxId);
  } else {
    saleRecord = await new Promise((resolve) => {
      const tx = db.transaction('offline_sales', 'readonly');
      const req = tx.objectStore('offline_sales').get(clientTxId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  if (saleRecord) {
    await addSyncAuditEntry({
      businessId: saleRecord.businessId,
      clientTxId,
      status: 'discarded',
      message: reason,
      details: {
        ...auditInfo,
        grandTotalMinor: saleRecord.grandTotalMinor,
        itemsCount: saleRecord.items?.length,
        offlineCreatedAt: saleRecord.offlineCreatedAt,
      },
    });
  }

  return removeOfflineSale(clientTxId);
}

/**
 * Clears business data on logout or business switch.
 */
export async function clearBusinessData(businessId) {
  if (!businessId) return;
  const db = await getDb();

  if (!db) {
    for (const key of memoryFallback.products.keys()) {
      if (key.startsWith(`${businessId}:`)) memoryFallback.products.delete(key);
    }
    for (const key of memoryFallback.customers.keys()) {
      if (key.startsWith(`${businessId}:`)) memoryFallback.customers.delete(key);
    }
    return true;
  }

  // Clear products & customers scoped to this business
  const tx = db.transaction(['products', 'customers'], 'readwrite');
  const prodIndex = tx.objectStore('products').index('by_business');
  const custIndex = tx.objectStore('customers').index('by_business');

  prodIndex.openKeyCursor(businessId).onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      tx.objectStore('products').delete(cursor.primaryKey);
      cursor.continue();
    }
  };

  custIndex.openKeyCursor(businessId).onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      tx.objectStore('customers').delete(cursor.primaryKey);
      cursor.continue();
    }
  };

  return true;
}

/**
 * Records an entry in the client sync audit log.
 */
export async function addSyncAuditEntry({ businessId, clientTxId, status, message, details = {} }) {
  const entry = {
    businessId,
    clientTxId,
    status,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  const db = await getDb();
  if (!db) {
    memoryFallback.history.unshift(entry);
    if (memoryFallback.history.length > 100) memoryFallback.history.pop();
    return entry;
  }

  return new Promise((resolve) => {
    const tx = db.transaction('sync_history', 'readwrite');
    const store = tx.objectStore('sync_history');
    const req = store.add(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => resolve(entry);
  });
}

/**
 * Retrieves the client sync audit log for a business.
 */
export async function getSyncHistory(businessId, limit = 50) {
  if (!businessId) return [];
  const db = await getDb();

  if (!db) {
    return memoryFallback.history
      .filter((h) => h.businessId === businessId)
      .slice(0, limit);
  }

  return new Promise((resolve) => {
    const tx = db.transaction('sync_history', 'readonly');
    const store = tx.objectStore('sync_history');
    const index = store.index('by_business');
    const req = index.getAll(businessId);
    req.onsuccess = () => {
      const records = req.result || [];
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      resolve(records.slice(0, limit));
    };
    req.onerror = () => resolve([]);
  });
}

export default {
  getDb,
  isDurableStorageAvailable,
  cacheCatalog,
  getCachedProducts,
  getCachedCustomers,
  queueOfflineSale,
  getAllQueuedSales,
  getPendingSales,
  updateSaleStatus,
  removeOfflineSale,
  discardOfflineSale,
  clearBusinessData,
  addSyncAuditEntry,
  getSyncHistory,
};
