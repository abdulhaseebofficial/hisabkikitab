-- A demo identity is data, not a password convention. The API uses this flag
-- to reject protected mutations before a controller or repository can run.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_single_demo_idx
  ON users (is_demo)
  WHERE is_demo;

-- Defense in depth: API middleware rejects demo mutations before a controller
-- runs, and these triggers reject any accidental repository, worker or direct
-- SQL write that reaches a demo-owned row. The database connection is private
-- to the API, so this complements (rather than replaces) request authorization.
CREATE OR REPLACE FUNCTION hkk_reject_demo_user_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_owner_id uuid;
  new_owner_id uuid;
BEGIN
  old_owner_id := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE NULLIF(to_jsonb(OLD) ->> TG_ARGV[0], '')::uuid END;
  new_owner_id := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid END;
  IF EXISTS (
    SELECT 1 FROM users
    WHERE id IN (old_owner_id, new_owner_id) AND is_demo
  ) THEN
    RAISE EXCEPTION 'Demo Mode is read-only' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION hkk_reject_demo_goal_contribution() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_goal uuid;
  new_goal uuid;
BEGIN
  old_goal := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE NULLIF(to_jsonb(OLD) ->> 'goal_id', '')::uuid END;
  new_goal := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NULLIF(to_jsonb(NEW) ->> 'goal_id', '')::uuid END;
  IF EXISTS (
    SELECT 1 FROM goals g JOIN users u ON u.id = g.user_id
    WHERE g.id IN (old_goal, new_goal) AND u.is_demo
  ) THEN
    RAISE EXCEPTION 'Demo Mode is read-only' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION hkk_reject_demo_space_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_space uuid;
  new_space uuid;
BEGIN
  old_space := CASE WHEN TG_OP = 'INSERT' THEN NULL
    ELSE NULLIF(to_jsonb(OLD) ->> 'space_id', '')::uuid END;
  new_space := CASE WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NULLIF(to_jsonb(NEW) ->> 'space_id', '')::uuid END;
  IF EXISTS (
    SELECT 1 FROM sl_spaces s JOIN users u ON u.id = s.owner_id
    WHERE s.id IN (old_space, new_space) AND u.is_demo
  ) THEN
    RAISE EXCEPTION 'Demo Mode is read-only' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- The account row itself cannot be edited, demoted or deleted after it becomes
-- the demo identity. The seed marks it only after all fictional data exists.
DROP TRIGGER IF EXISTS users_demo_read_only ON users;
CREATE TRIGGER users_demo_read_only
  BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW WHEN (OLD.is_demo)
  EXECUTE FUNCTION hkk_reject_demo_user_write('id');

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'refresh_tokens', 'expenses', 'income', 'goals', 'budgets',
    'notifications', 'feedback', 'chat_messages', 'debts', 'debt_payments',
    'financial_requests', 'debt_contacts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tab || '_demo_read_only', tab);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_user_write(''user_id'')',
      tab || '_demo_read_only', tab
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS goal_contributions_demo_read_only ON goal_contributions;
CREATE TRIGGER goal_contributions_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON goal_contributions
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_goal_contribution();

-- A new space is checked through owner_id; every child ledger row is checked
-- through its space. This covers memberships, periods, members, categories,
-- expenses, bills, shares, payments, receipts, invites and activity.
DROP TRIGGER IF EXISTS sl_spaces_demo_read_only ON sl_spaces;
CREATE TRIGGER sl_spaces_demo_read_only
  BEFORE INSERT OR UPDATE OR DELETE ON sl_spaces
  FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_user_write('owner_id');

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'sl_memberships', 'sl_invites', 'sl_periods', 'sl_members', 'sl_categories',
    'sl_expenses', 'sl_bills', 'sl_shares', 'sl_payments', 'sl_activity',
    'sl_receipts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', tab || '_demo_read_only', tab);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION hkk_reject_demo_space_write()',
      tab || '_demo_read_only', tab
    );
  END LOOP;
END $$;

