-- Keep historic budgets and receipt rows intact, while making new shared-space
-- workflows independent of a monthly spending target.
ALTER TABLE sl_spaces ADD COLUMN IF NOT EXISTS organization_type text NOT NULL DEFAULT 'other';
ALTER TABLE sl_spaces ADD COLUMN IF NOT EXISTS organization_name text NOT NULL DEFAULT '';
ALTER TABLE sl_spaces DROP CONSTRAINT IF EXISTS sl_spaces_organization_type_check;
ALTER TABLE sl_spaces ADD CONSTRAINT sl_spaces_organization_type_check
  CHECK (organization_type IN ('university', 'company', 'hostel', 'other'));
ALTER TABLE sl_spaces DROP CONSTRAINT IF EXISTS sl_spaces_organization_name_check;
ALTER TABLE sl_spaces ADD CONSTRAINT sl_spaces_organization_name_check
  CHECK (length(organization_name) <= 100);

ALTER TABLE sl_bills DROP CONSTRAINT IF EXISTS sl_bills_amount_minor_check;
ALTER TABLE sl_bills ADD CONSTRAINT sl_bills_amount_minor_check
  CHECK (amount_minor BETWEEN 0 AND 999999999999);
ALTER TABLE sl_bills ADD COLUMN IF NOT EXISTS split_pending boolean NOT NULL DEFAULT false;
ALTER TABLE sl_expenses ADD COLUMN IF NOT EXISTS split_pending boolean NOT NULL DEFAULT false;
ALTER TABLE sl_bills DROP CONSTRAINT IF EXISTS sl_bills_method_check;
ALTER TABLE sl_bills ADD CONSTRAINT sl_bills_method_check
  CHECK (method IN ('equal','selected','weighted','percentage','custom','later'));
ALTER TABLE sl_expenses DROP CONSTRAINT IF EXISTS sl_expenses_method_check;
ALTER TABLE sl_expenses ADD CONSTRAINT sl_expenses_method_check
  CHECK (method IN ('equal','selected','weighted','percentage','custom','later'));

-- An unresolved split is explicit. Zero-value shares may retain the chosen
-- participants until the admin sets amounts; resolved rows still reconcile.
CREATE OR REPLACE FUNCTION sl_check_shares() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; expected bigint; actual numeric; source text; pending boolean;
BEGIN
 IF TG_TABLE_NAME='sl_shares' THEN
  target:=COALESCE(NEW.expense_id,NEW.bill_id,OLD.expense_id,OLD.bill_id);
  source:=CASE WHEN COALESCE(NEW.expense_id,OLD.expense_id) IS NOT NULL THEN 'sl_expenses' ELSE 'sl_bills' END;
 ELSE target:=COALESCE(NEW.id,OLD.id); source:=TG_TABLE_NAME; END IF;
 EXECUTE format('SELECT amount_minor,split_pending FROM %I WHERE id=$1',source) INTO expected,pending USING target;
 SELECT COALESCE(sum(amount_minor),0) INTO actual FROM sl_shares WHERE expense_id=target OR bill_id=target;
 IF expected IS NOT NULL AND NOT pending AND expected<>actual THEN
  RAISE EXCEPTION 'Invalid share total' USING ERRCODE='23514';
 END IF;
 IF pending AND actual<>0 THEN
  RAISE EXCEPTION 'Pending split cannot have shares' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
