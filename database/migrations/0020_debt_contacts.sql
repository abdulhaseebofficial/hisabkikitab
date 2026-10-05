-- F8: assign each old debt its own identity. Equal names are not evidence that
-- two historical records concern the same human. No debt amount, payment, or
-- legacy person_name/person_contact value is changed by this migration.
CREATE TABLE IF NOT EXISTS debt_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  contact_info text NOT NULL DEFAULT '' CHECK (length(contact_info) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debt_contacts_id_user_key UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS debt_contacts_user_name_idx ON debt_contacts (user_id, lower(display_name));

CREATE OR REPLACE FUNCTION debt_contact_identity_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Debt contact identity and owner cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS debt_contacts_identity_immutable ON debt_contacts;
CREATE TRIGGER debt_contacts_identity_immutable BEFORE UPDATE ON debt_contacts
  FOR EACH ROW EXECUTE FUNCTION debt_contact_identity_immutable();

ALTER TABLE debts ADD COLUMN IF NOT EXISTS contact_id uuid;

-- The temporary map gives every old debt a distinct UUID, including rows with
-- identical names. It also makes reapplication leave already linked rows alone.
CREATE TEMP TABLE debt_contact_backfill ON COMMIT DROP AS
  SELECT id AS debt_id, user_id, person_name, person_contact,
         gen_random_uuid() AS contact_id
    FROM debts WHERE contact_id IS NULL;
INSERT INTO debt_contacts (id, user_id, display_name, contact_info)
  SELECT contact_id, user_id, person_name, person_contact FROM debt_contact_backfill;
UPDATE debts d SET contact_id = b.contact_id
  FROM debt_contact_backfill b WHERE d.id = b.debt_id;
DROP TABLE debt_contact_backfill;

-- Old direct writers can still insert a debt using its legacy name. Each such
-- insertion creates a NEW contact; it never looks up another row by name.
CREATE OR REPLACE FUNCTION debt_contact_for_legacy_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN
    INSERT INTO debt_contacts (user_id, display_name, contact_info)
      VALUES (NEW.user_id, NEW.person_name, NEW.person_contact)
      RETURNING id INTO NEW.contact_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS debts_legacy_contact_insert ON debts;
CREATE TRIGGER debts_legacy_contact_insert BEFORE INSERT ON debts
  FOR EACH ROW EXECUTE FUNCTION debt_contact_for_legacy_insert();

ALTER TABLE debts ALTER COLUMN contact_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'debts'::regclass AND conname = 'debts_contact_owner_fkey') THEN
    ALTER TABLE debts ADD CONSTRAINT debts_contact_owner_fkey
      FOREIGN KEY (contact_id, user_id) REFERENCES debt_contacts (id, user_id)
      ON UPDATE RESTRICT ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS debts_user_contact_idx ON debts (user_id, contact_id);

-- Rollback is manual in this forward-only runner. Drop the debt FK/column and
-- trigger before the contact table; keep a backup for any contacts created
-- after cutover. Rolling back loses stable associations, not financial rows.
