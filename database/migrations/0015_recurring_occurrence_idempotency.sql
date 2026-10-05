-- Preserve historical generated rows as-is. Only newly materialized occurrences
-- carry the marker, allowing an index even if historical duplicates exist.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_occurrence boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_generated_occurrence_key
  ON expenses (generated_from, date)
  WHERE recurrence_occurrence AND generated_from IS NOT NULL;
