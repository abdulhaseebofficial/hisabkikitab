import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import storage from '../services/posOfflineStorage';
import businessApi from '../api/businessApi';

/**
 * Custom React Hook for Managing Offline POS Synchronization & State.
 *
 * Handles:
 * - Online/Offline connectivity transitions
 * - Client-side IndexedDB transaction queue management
 * - Automatic background synchronization upon reconnection
 * - Manual retry and conflict resolution
 * - POS indicators and audit tracking
 */
export function usePosOfflineSync(businessId, user) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [queuedSales, setQueuedSales] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const isSyncingRef = useRef(false);

  // Load and refresh the transaction queue for the active business and user
  const refreshQueue = useCallback(async () => {
    if (!businessId) return [];
    try {
      const sales = await storage.getAllQueuedSales(businessId, user?.id);
      setQueuedSales(sales);
      return sales;
    } catch (err) {
      console.error('[Offline Sync] Failed to load queue:', err);
      return [];
    }
  }, [businessId, user?.id]);

  // Synchronize an individual offline sale to the authoritative server
  const syncSingleSale = useCallback(
    async (sale, options = {}) => {
      if (!businessId) return { success: false, message: 'No active business' };

      // Demo user check
      if (user?.is_demo) {
        await storage.updateSaleStatus(sale.clientTxId, {
          syncStatus: 'failed',
          conflictReason: 'Demo account is read-only. Offline mutations cannot be posted.',
        });
        await refreshQueue();
        return { success: false, message: 'Demo account is read-only' };
      }

      await storage.updateSaleStatus(sale.clientTxId, { syncStatus: 'syncing' });
      await refreshQueue();

      try {
        const payload = {
          clientTxId: sale.clientTxId,
          offlineCreatedAt: sale.offlineCreatedAt,
          items: options.adjustedItems || sale.items,
          customerId: sale.customerId || null,
          paymentMethod: sale.paymentMethod || 'cash',
          discountMinor: sale.discountMinor || 0,
          notes: sale.notes || '',
          acceptCatalogPrice: Boolean(options.acceptCatalogPrice),
          creditOverride: options.creditOverride || null,
          resolutionAudit: options.resolutionAudit || null,
          deviceFingerprint: typeof navigator !== 'undefined' ? navigator.userAgent : 'POS-Browser',
        };

        const res = await businessApi.syncOfflineSale(businessId, payload);
        const data = res.data;

        if (data.status === 'synced') {
          await storage.updateSaleStatus(sale.clientTxId, {
            syncStatus: 'synced',
            serverSaleId: data.saleId,
            serverSaleNumber: data.saleNumber,
            conflictCode: null,
            conflictReason: null,
          });

          await storage.addSyncAuditEntry({
            businessId,
            clientTxId: sale.clientTxId,
            status: 'synced',
            message: `Sale ${data.saleNumber} posted successfully`,
          });

          setLastSyncTime(new Date());
          await refreshQueue();
          return { success: true, data };
        } else if (data.status === 'conflict') {
          await storage.updateSaleStatus(sale.clientTxId, {
            syncStatus: 'conflict',
            conflictCode: data.conflictCode,
            conflictReason: data.conflictReason,
          });

          await storage.addSyncAuditEntry({
            businessId,
            clientTxId: sale.clientTxId,
            status: 'conflict',
            message: data.conflictReason,
            details: data.conflicts,
          });

          await refreshQueue();
          return { success: false, conflict: true, data };
        }
      } catch (err) {
        const errData = err?.response?.data;
        if (err?.response?.status === 409 && errData?.data?.status === 'conflict') {
          const conflictData = errData.data;
          await storage.updateSaleStatus(sale.clientTxId, {
            syncStatus: 'conflict',
            conflictCode: conflictData.conflictCode,
            conflictReason: conflictData.conflictReason || errData.message,
          });

          await storage.addSyncAuditEntry({
            businessId,
            clientTxId: sale.clientTxId,
            status: 'conflict',
            message: conflictData.conflictReason || errData.message,
            details: conflictData.conflicts,
          });

          await refreshQueue();
          return { success: false, conflict: true, data: conflictData };
        }

        const reason = errData?.message || err.message || 'Network sync error';
        await storage.updateSaleStatus(sale.clientTxId, {
          syncStatus: 'failed',
          conflictReason: reason,
          retryCount: (sale.retryCount || 0) + 1,
        });

        await storage.addSyncAuditEntry({
          businessId,
          clientTxId: sale.clientTxId,
          status: 'failed',
          message: reason,
        });

        await refreshQueue();
        return { success: false, error: reason };
      }
    },
    [businessId, user, refreshQueue]
  );

  // Synchronize all pending/conflict sales
  const syncAllPending = useCallback(async () => {
    if (!businessId || isSyncingRef.current || !isOnline) return;

    const pending = await storage.getPendingSales(businessId);
    if (!pending.length) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    let syncedCount = 0;
    let conflictCount = 0;

    try {
      for (const sale of pending) {
        // Skip unresolved conflicts during automatic background runs unless retrying
        if (sale.syncStatus === 'conflict') {
          conflictCount++;
          continue;
        }

        const result = await syncSingleSale(sale);
        if (result.success) {
          syncedCount++;
        } else if (result.conflict) {
          conflictCount++;
        }
      }

      if (syncedCount > 0) {
        toast.success(`Successfully synchronized ${syncedCount} offline ${syncedCount === 1 ? 'sale' : 'sales'}!`);
      }
      if (conflictCount > 0 && syncedCount === 0) {
        toast.error(`${conflictCount} offline ${conflictCount === 1 ? 'sale requires' : 'sales require'} conflict resolution.`);
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshQueue();
    }
  }, [businessId, isOnline, syncSingleSale, refreshQueue]);

  // Queue an offline sale
  const queueSale = useCallback(
    async (salePayload) => {
      if (!businessId) throw new Error('Active business is required');

      const queued = await storage.queueOfflineSale({
        ...salePayload,
        businessId,
        cashierId: user?.id,
        cashierName: user?.full_name || 'Cashier',
      });

      await refreshQueue();

      // If online and not demo user, attempt immediate sync in background
      if (isOnline && !user?.is_demo) {
        syncSingleSale(queued).catch(console.error);
      }

      return queued;
    },
    [businessId, user, isOnline, syncSingleSale, refreshQueue]
  );

  // Retry an individual sale
  const retrySale = useCallback(
    async (clientTxId, options = {}) => {
      const sale = queuedSales.find((s) => s.clientTxId === clientTxId);
      if (!sale) return;
      return syncSingleSale(sale, options);
    },
    [queuedSales, syncSingleSale]
  );

  // Adjust conflict quantities or items and retry synchronization
  const adjustAndRetrySale = useCallback(
    async (clientTxId, adjustedItems, resolutionReason = '') => {
      const sale = queuedSales.find((s) => s.clientTxId === clientTxId);
      if (!sale) return { success: false, message: 'Sale not found in queue' };

      // Recalculate grand total
      const newTotal = adjustedItems.reduce(
        (sum, it) => sum + (it.unitPriceMinor || 0) * (it.quantity || 1),
        0
      );

      await storage.updateSaleStatus(clientTxId, {
        items: adjustedItems,
        grandTotalMinor: newTotal,
        conflictCode: null,
        conflictReason: null,
      });

      return syncSingleSale(
        { ...sale, items: adjustedItems, grandTotalMinor: newTotal },
        {
          resolutionAudit: {
            resolvedBy: user?.id,
            reason: resolutionReason || 'Manager adjusted item quantities to available stock',
            adjustedAt: new Date().toISOString(),
          },
        }
      );
    },
    [queuedSales, user?.id, syncSingleSale]
  );

  // Discard an offline sale from the queue with mandatory audit tracking
  const discardSale = useCallback(
    async (clientTxId, reason = 'Operator discarded conflicted offline transaction') => {
      await storage.discardOfflineSale(clientTxId, reason, {
        operatorId: user?.id,
        operatorName: user?.full_name || user?.name || 'Operator',
      });
      await refreshQueue();
      toast.success('Offline transaction removed and auditable event logged');
    },
    [user, refreshQueue]
  );

  // Listen to network status changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored. Auto-syncing pending transactions...');
      syncAllPending();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error('Internet connection lost. Operating in Offline POS mode.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncAllPending]);

  // Load initial queue
  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const pendingCount = queuedSales.filter((s) => s.syncStatus === 'pending_sync').length;
  const conflictCount = queuedSales.filter((s) => s.syncStatus === 'conflict').length;
  const failedCount = queuedSales.filter((s) => s.syncStatus === 'failed').length;

  return {
    isOnline,
    isSyncing,
    queuedSales,
    pendingCount,
    conflictCount,
    failedCount,
    lastSyncTime,
    queueSale,
    retrySale,
    adjustAndRetrySale,
    discardSale,
    syncAllPending,
    refreshQueue,
  };
}

export default usePosOfflineSync;
