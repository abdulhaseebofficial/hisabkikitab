-- Every space has exactly one owner membership. The owner is stored on the
-- space, and that same account must hold the space's sole admin membership.
-- Deferred checks allow ownership and membership roles to change atomically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sl_spaces s
    WHERE NOT EXISTS (
      SELECT 1 FROM sl_memberships m
      WHERE m.space_id=s.id AND m.user_id=s.owner_id AND m.role='admin'
    ) OR (
      SELECT count(*) FROM sl_memberships m WHERE m.space_id=s.id AND m.role='admin'
    ) <> 1
  ) THEN
    RAISE EXCEPTION 'Existing Shared Living ownership invariant is invalid; reconcile before migration'
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sl_memberships_one_admin_per_space
  ON sl_memberships(space_id) WHERE role = 'admin';

CREATE OR REPLACE FUNCTION sl_require_valid_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target_space uuid; current_owner uuid; affected_spaces uuid[];
BEGIN
  IF TG_TABLE_NAME = 'sl_spaces' THEN
    affected_spaces := ARRAY[NEW.id, OLD.id];
  ELSE
    affected_spaces := ARRAY[NEW.space_id, OLD.space_id];
  END IF;

  FOREACH target_space IN ARRAY affected_spaces LOOP
    IF target_space IS NULL THEN CONTINUE; END IF;
    SELECT owner_id INTO current_owner FROM sl_spaces WHERE id = target_space;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM sl_memberships
      WHERE space_id = target_space AND user_id = current_owner AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Shared Living space must retain its owner membership'
        USING ERRCODE = '23514', CONSTRAINT = 'sl_spaces_valid_owner_membership';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS sl_spaces_valid_owner ON sl_spaces;
CREATE CONSTRAINT TRIGGER sl_spaces_valid_owner
  AFTER INSERT OR UPDATE ON sl_spaces DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sl_require_valid_owner();

DROP TRIGGER IF EXISTS sl_memberships_valid_owner ON sl_memberships;
CREATE CONSTRAINT TRIGGER sl_memberships_valid_owner
  AFTER INSERT OR UPDATE OR DELETE ON sl_memberships DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sl_require_valid_owner();
