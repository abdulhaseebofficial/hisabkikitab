-- Lets an account exist without a password, so a student can sign in with Google.
--
-- Two changes, and one rule that ties them together.
--
-- 1. users.password becomes nullable. An account created through Google has no
--    password and never had one; storing a random unusable string instead
--    would be a lie the rest of the code would eventually believe.
--
-- 2. users.google_id holds the Google subject claim ("sub"), which is the only
--    stable identifier Google promises. It is NOT the email: a person can
--    change the email on their Google account, and matching on email alone is
--    how accounts get taken over. Unique, so one Google account maps to exactly
--    one Hisabki Kitab account.
--
-- 3. The CHECK says an account must be reachable somehow - by password, or by
--    Google, or by both. Without it, a bug could leave a row nobody can ever
--    sign in to, and that row would look perfectly normal.
--
-- Additive and non-destructive: no column is dropped or rewritten, and every
-- existing row already satisfies the CHECK because it has a password. Dropping
-- NOT NULL cannot fail on existing data.
--
-- Rollback (the runner is forward-only; run by hand if ever needed):
--   ALTER TABLE users DROP CONSTRAINT users_has_a_way_in;
--   ALTER TABLE users DROP COLUMN google_id;
--   ALTER TABLE users ALTER COLUMN password SET NOT NULL;   -- only safe while
--                                                            -- no Google-only
--                                                            -- account exists

ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text;

-- Partial, so the many password-only rows with a NULL google_id do not collide
-- with each other.
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key
  ON users (google_id) WHERE google_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_has_a_way_in' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_has_a_way_in
      CHECK (password IS NOT NULL OR google_id IS NOT NULL);
  END IF;
END $$;
