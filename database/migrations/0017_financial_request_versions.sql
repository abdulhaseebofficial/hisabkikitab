-- Existing Shared Living records start at version 1 without changing their money or history.
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['sl_expenses','sl_bills','sl_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', tab);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=tab::regclass AND conname=tab||'_version_positive') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (version > 0)', tab, tab||'_version_positive');
    END IF;
  END LOOP;
END $$;

-- A committed request result is written in the same transaction as its mutation.
-- The primary key serializes retries from separate workers and keeps users isolated.
CREATE TABLE IF NOT EXISTS financial_requests (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  action text NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
