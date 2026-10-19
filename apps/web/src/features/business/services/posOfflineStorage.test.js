import { describe, it, expect, beforeEach } from 'vitest';
import storage from './posOfflineStorage';

describe('posOfflineStorage', () => {
  const businessId = 'test-biz-uuid-123';

  beforeEach(async () => {
    await storage.clearBusinessData(businessId);
  });

  it('caches and retrieves products with search filtering', async () => {
    const products = [
      { id: 'p1', name: 'Fresh Milk 1L', barcode: '8964001', selling_price_minor: 25000, current_stock: 50, category_id: 'dairy' },
      { id: 'p2', name: 'Wheat Flour 5kg', barcode: '8964002', selling_price_minor: 65000, current_stock: 20, category_id: 'grains' },
      { id: 'p3', name: 'Chai Patti 500g', barcode: '8964003', selling_price_minor: 45000, current_stock: 30, category_id: 'tea' },
    ];

    await storage.cacheCatalog(businessId, products, []);

    // Search by name
    const foundByName = await storage.getCachedProducts(businessId, 'Milk');
    expect(foundByName).toHaveLength(1);
    expect(foundByName[0].name).toBe('Fresh Milk 1L');

    // Search by barcode
    const foundByBarcode = await storage.getCachedProducts(businessId, '8964002');
    expect(foundByBarcode).toHaveLength(1);
    expect(foundByBarcode[0].name).toBe('Wheat Flour 5kg');

    // Filter by category
    const foundByCategory = await storage.getCachedProducts(businessId, '', 'tea');
    expect(foundByCategory).toHaveLength(1);
    expect(foundByCategory[0].name).toBe('Chai Patti 500g');
  });

  it('queues an offline sale with pending_sync status and unique clientTxId', async () => {
    const salePayload = {
      businessId,
      customerId: null,
      paymentMethod: 'cash',
      items: [
        { productId: 'p1', productName: 'Fresh Milk 1L', quantity: 2, unitPriceMinor: 25000 },
      ],
      subtotalMinor: 50000,
      grandTotalMinor: 50000,
    };

    const queued = await storage.queueOfflineSale(salePayload);

    expect(queued).toBeDefined();
    expect(queued.clientTxId).toBeDefined();
    expect(queued.syncStatus).toBe('pending_sync');
    expect(queued.businessId).toBe(businessId);

    const pending = await storage.getPendingSales(businessId);
    expect(pending.some((s) => s.clientTxId === queued.clientTxId)).toBe(true);
  });

  it('updates offline sale status and records sync audit history', async () => {
    const queued = await storage.queueOfflineSale({
      businessId,
      items: [{ productId: 'p1', quantity: 1, unitPriceMinor: 10000 }],
    });

    const updated = await storage.updateSaleStatus(queued.clientTxId, {
      syncStatus: 'synced',
      serverSaleId: 'sale-999',
      serverSaleNumber: 'INV-00042',
    });

    expect(updated.syncStatus).toBe('synced');
    expect(updated.serverSaleNumber).toBe('INV-00042');

    await storage.addSyncAuditEntry({
      businessId,
      clientTxId: queued.clientTxId,
      status: 'synced',
      message: 'Successfully synchronized to server',
    });

    const history = await storage.getSyncHistory(businessId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].clientTxId).toBe(queued.clientTxId);
  });

  it('removes offline sale from the queue upon discard', async () => {
    const queued = await storage.queueOfflineSale({
      businessId,
      items: [{ productId: 'p1', quantity: 1, unitPriceMinor: 10000 }],
    });

    await storage.removeOfflineSale(queued.clientTxId);
    const all = await storage.getAllQueuedSales(businessId);
    expect(all.some((s) => s.clientTxId === queued.clientTxId)).toBe(false);
  });

  it('partitions queued sales by userId to protect multi-user terminal data', async () => {
    const saleUserA = await storage.queueOfflineSale({
      businessId,
      userId: 'user-A',
      items: [{ productId: 'p1', quantity: 1, unitPriceMinor: 10000 }],
    });
    const saleUserB = await storage.queueOfflineSale({
      businessId,
      userId: 'user-B',
      items: [{ productId: 'p2', quantity: 2, unitPriceMinor: 20000 }],
    });

    const userASales = await storage.getAllQueuedSales(businessId, 'user-A');
    expect(userASales.some((s) => s.clientTxId === saleUserA.clientTxId)).toBe(true);
    expect(userASales.some((s) => s.clientTxId === saleUserB.clientTxId)).toBe(false);

    const userBSales = await storage.getAllQueuedSales(businessId, 'user-B');
    expect(userBSales.some((s) => s.clientTxId === saleUserB.clientTxId)).toBe(true);
    expect(userBSales.some((s) => s.clientTxId === saleUserA.clientTxId)).toBe(false);
  });

  it('sanitizes customer catalog records to protect sensitive attributes in browser cache', async () => {
    const rawCustomers = [
      {
        id: 'cust-1',
        name: 'Haji Aslam',
        phone: '03001234567',
        current_balance_minor: 50000,
        credit_limit_minor: 100000,
        is_active: true,
        address: 'Secret Private Villa 42',
        internal_risk_rating: 'high',
        bank_account_number: 'PK99MEZN123456789',
      },
    ];

    await storage.cacheCatalog(businessId, [], rawCustomers);
    const cached = await storage.getCachedCustomers(businessId);

    expect(cached).toHaveLength(1);
    expect(cached[0].name).toBe('Haji Aslam');
    expect(cached[0].phone).toBe('03001234567');
    expect(cached[0].current_balance_minor).toBe(50000);
    // Verify private and sensitive internal fields are stripped out
    expect(cached[0].address).toBeUndefined();
    expect(cached[0].internal_risk_rating).toBeUndefined();
    expect(cached[0].bank_account_number).toBeUndefined();
  });

  it('records an auditable event in sync history upon discardOfflineSale', async () => {
    const queued = await storage.queueOfflineSale({
      businessId,
      grandTotalMinor: 75000,
      items: [{ productId: 'p1', quantity: 3, unitPriceMinor: 25000 }],
    });

    await storage.discardOfflineSale(queued.clientTxId, 'Cashier cancelled due to customer exit', { operator: 'Cashier-1' });

    const all = await storage.getAllQueuedSales(businessId);
    expect(all.some((s) => s.clientTxId === queued.clientTxId)).toBe(false);

    const history = await storage.getSyncHistory(businessId);
    const discardEvent = history.find((h) => h.clientTxId === queued.clientTxId && h.status === 'discarded');
    expect(discardEvent).toBeDefined();
    expect(discardEvent.message).toBe('Cashier cancelled due to customer exit');
  });
});
