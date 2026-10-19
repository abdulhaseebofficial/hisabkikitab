-- 0028_v3_offline_pos_sync.sql
-- HisabKi Kitab Business Mode V3: Offline POS Synchronization Subsystem
-- Client-generated transaction tracking, offline synchronization audit log,
-- conflict detection, negative-stock prevention, and demo write protection.

-- ============================================================================
-- 1. ADD CLIENT TRANSACTION ID TO BIZ_SALES
-- ============================================================================
-- Associates every synchronized POS sale directly with its client-generated UUID
-- to guarantee end-to-end traceability and prevent duplicate posting across network retries.
ALTER TABLE biz_sales
  ADD COLUMN IF NOT EXISTS client_tx_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_sales_business_client_tx_id
  ON biz_sales(business_id, client_tx_id)
  WHERE client_tx_id IS NOT NULL;

-- ============================================================================
-- 2. OFFLINE POS SYNCHRONIZATION AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS biz_offline_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  client_tx_id uuid NOT NULL,
  sale_id uuid REFERENCES biz_sales(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('synced', 'conflict', 'failed', 'rejected')),
  conflict_code text, -- 'INSUFFICIENT_STOCK', 'PRICE_CHANGED', 'PRODUCT_INACTIVE', 'PRODUCT_NOT_FOUND', 'CREDIT_LIMIT_EXCEEDED'
  conflict_reason text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb DEFAULT '{}'::jsonb,
  device_fingerprint text NOT NULL DEFAULT '',
  offline_created_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, client_tx_id)
);

CREATE INDEX IF NOT EXISTS biz_offline_sync_log_biz_idx
  ON biz_offline_sync_log(business_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS biz_offline_sync_log_status_idx
  ON biz_offline_sync_log(business_id, status);

CREATE INDEX IF NOT EXISTS biz_offline_sync_log_client_tx_idx
  ON biz_offline_sync_log(client_tx_id);

-- ============================================================================
-- 3. DEMO ACCOUNT WRITE PROTECTION TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS biz_offline_sync_log_demo_guard ON biz_offline_sync_log;
CREATE TRIGGER biz_offline_sync_log_demo_guard
  BEFORE INSERT OR UPDATE OR DELETE ON biz_offline_sync_log
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_business_write();
