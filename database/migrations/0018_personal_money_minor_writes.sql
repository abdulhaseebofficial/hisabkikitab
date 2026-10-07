-- Keep the legacy columns for rollback, while allowing exact minor-unit writes.
-- Historical rows are not rewritten. Older clients that update only the legacy
-- column still pass through the strict conversion installed by 0016.
CREATE OR REPLACE FUNCTION sync_personal_money_minor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i integer; legacy_name text; minor_name text; cents bigint; legacy_changed boolean; minor_changed boolean;
BEGIN
  i := 0;
  WHILE i < TG_NARGS LOOP
    legacy_name := TG_ARGV[i]; minor_name := TG_ARGV[i + 1];
    minor_changed := TG_OP = 'INSERT' AND (to_jsonb(NEW)->>minor_name) IS NOT NULL;
    legacy_changed := TG_OP = 'INSERT' AND NOT minor_changed;
    IF TG_OP = 'UPDATE' THEN
      minor_changed := (to_jsonb(NEW)->>minor_name) IS DISTINCT FROM (to_jsonb(OLD)->>minor_name);
      legacy_changed := (to_jsonb(NEW)->>legacy_name) IS DISTINCT FROM (to_jsonb(OLD)->>legacy_name);
    END IF;
    IF minor_changed THEN
      cents := (to_jsonb(NEW)->>minor_name)::bigint;
      IF legacy_changed AND personal_money_minor((to_jsonb(NEW)->>legacy_name)::double precision) <> cents THEN
        RAISE EXCEPTION 'Conflicting legacy and minor-unit money values';
      END IF;
      NEW := jsonb_populate_record(NEW, jsonb_build_object(legacy_name, (cents::numeric / 100)::double precision));
      IF personal_money_minor((to_jsonb(NEW)->>legacy_name)::double precision) <> cents THEN
        RAISE EXCEPTION 'Minor-unit amount cannot be mirrored in the legacy column';
      END IF;
    ELSIF legacy_changed THEN
      cents := personal_money_minor((to_jsonb(NEW)->>legacy_name)::double precision);
      NEW := jsonb_populate_record(NEW, jsonb_build_object(minor_name, cents));
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;
