-- Additive exact-money shadow. The legacy columns remain intact for rollback.
-- Refuse values that cannot be represented as whole minor units; never round
-- historical financial records silently. Application reads still use legacy
-- columns until a separately verified switch is released.
CREATE OR REPLACE FUNCTION personal_money_minor(value double precision) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE cents numeric;
BEGIN
  IF value::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Personal money contains a non-finite value';
  END IF;
  cents := value::numeric * 100;
  IF cents <> trunc(cents) OR cents < -9223372036854775808 OR cents > 9223372036854775807 THEN
    RAISE EXCEPTION 'Personal money cannot be represented in minor units; reconcile before migration';
  END IF;
  RETURN cents::bigint;
END;
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_income_minor bigint;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_minor bigint;
ALTER TABLE income ADD COLUMN IF NOT EXISTS amount_minor bigint;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_amount_minor bigint, ADD COLUMN IF NOT EXISTS saved_amount_minor bigint;
ALTER TABLE goal_contributions ADD COLUMN IF NOT EXISTS amount_minor bigint;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS limit_minor bigint;

UPDATE users SET monthly_income_minor = personal_money_minor(monthly_income);
UPDATE expenses SET amount_minor = personal_money_minor(amount);
UPDATE income SET amount_minor = personal_money_minor(amount);
UPDATE goals SET target_amount_minor = personal_money_minor(target_amount),
                 saved_amount_minor = personal_money_minor(saved_amount);
UPDATE goal_contributions SET amount_minor = personal_money_minor(amount);
UPDATE budgets SET limit_minor = personal_money_minor("limit");

ALTER TABLE users ALTER COLUMN monthly_income_minor SET NOT NULL;
ALTER TABLE expenses ALTER COLUMN amount_minor SET NOT NULL;
ALTER TABLE income ALTER COLUMN amount_minor SET NOT NULL;
ALTER TABLE goals ALTER COLUMN target_amount_minor SET NOT NULL,
                  ALTER COLUMN saved_amount_minor SET NOT NULL;
ALTER TABLE goal_contributions ALTER COLUMN amount_minor SET NOT NULL;
ALTER TABLE budgets ALTER COLUMN limit_minor SET NOT NULL;

-- During the staged transition every legacy write must maintain its shadow.
CREATE OR REPLACE FUNCTION sync_personal_money_minor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i integer; cents bigint;
BEGIN
  i := 0;
  WHILE i < TG_NARGS LOOP
    cents := personal_money_minor((to_jsonb(NEW)->>TG_ARGV[i])::double precision);
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[i + 1], cents));
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_money_shadow ON users;
CREATE TRIGGER users_money_shadow BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sync_personal_money_minor('monthly_income','monthly_income_minor');
DROP TRIGGER IF EXISTS expenses_money_shadow ON expenses;
CREATE TRIGGER expenses_money_shadow BEFORE INSERT OR UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION sync_personal_money_minor('amount','amount_minor');
DROP TRIGGER IF EXISTS income_money_shadow ON income;
CREATE TRIGGER income_money_shadow BEFORE INSERT OR UPDATE ON income
FOR EACH ROW EXECUTE FUNCTION sync_personal_money_minor('amount','amount_minor');
DROP TRIGGER IF EXISTS goals_money_shadow ON goals;
CREATE TRIGGER goals_money_shadow BEFORE INSERT OR UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION sync_personal_money_minor('target_amount','target_amount_minor','saved_amount','saved_amount_minor');
DROP TRIGGER IF EXISTS goal_contributions_money_shadow ON goal_contributions;
CREATE TRIGGER goal_contributions_money_shadow BEFORE INSERT OR UPDATE ON goal_contributions
FOR EACH ROW EXECUTE FUNCTION sync_personal_money_minor('amount','amount_minor');
DROP TRIGGER IF EXISTS budgets_money_shadow ON budgets;
CREATE TRIGGER budgets_money_shadow BEFORE INSERT OR UPDATE ON budgets
FOR EACH ROW EXECUTE FUNCTION sync_personal_money_minor('limit','limit_minor');
