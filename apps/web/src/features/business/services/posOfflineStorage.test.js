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
});
