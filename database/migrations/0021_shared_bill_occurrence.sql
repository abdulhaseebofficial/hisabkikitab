-- A copied recurring bill keeps the root bill's identity across months.
-- Existing bills have no reliable provenance; do not infer it from visible fields.
ALTER TABLE sl_bills ADD COLUMN IF NOT EXISTS recurring_origin_id uuid;
-- NULL identifies a pre-cutover bill whose copy provenance cannot be inferred.
-- Adding the column without a default leaves old rows untouched; new rows get
-- TRUE after this statement. A copy into a period containing an unknown old
-- bill must stop for explicit historical review instead of guessing.
ALTER TABLE sl_bills ADD COLUMN IF NOT EXISTS recurrence_identity_known boolean;
ALTER TABLE sl_bills ALTER COLUMN recurrence_identity_known SET DEFAULT true;
-- NULL identifies a pre-cutover bill whose copy provenance cannot be inferred.
-- Adding the column without a default leaves old rows untouched; new rows get
-- TRUE after this statement. A copy into a period containing an unknown old
-- bill must stop for explicit historical review instead of guessing.
ALTER TABLE sl_bills ADD COLUMN IF NOT EXISTS recurrence_identity_known boolean;
ALTER TABLE sl_bills ALTER COLUMN recurrence_identity_known SET DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sl_bills'::regclass
      AND conname = 'sl_bills_recurring_origin_space_fkey'
  ) THEN
    ALTER TABLE sl_bills ADD CONSTRAINT sl_bills_recurring_origin_space_fkey
      FOREIGN KEY (recurring_origin_id, space_id)
      REFERENCES sl_bills(id, space_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Reapplication and staged imports must fail before index creation if they
-- contain exact lineage conflicts. Legacy NULL lineage rows are preserved.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM sl_bills WHERE recurring_origin_id IS NOT NULL
    GROUP BY space_id, period_id, recurring_origin_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Shared Living recurring occurrence; reconcile before migration'
      USING ERRCODE = '23505';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sl_bills_one_recurring_origin_per_period
  ON sl_bills(space_id, period_id, recurring_origin_id)
  WHERE recurring_origin_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sl_recurring_origin_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.recurring_origin_id IS DISTINCT FROM OLD.recurring_origin_id THEN
    RAISE EXCEPTION 'Recurring bill origin cannot change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sl_bills_recurring_origin_immutable ON sl_bills;
CREATE TRIGGER sl_bills_recurring_origin_immutable BEFORE UPDATE ON sl_bills
  FOR EACH ROW EXECUTE FUNCTION sl_recurring_origin_immutable();
