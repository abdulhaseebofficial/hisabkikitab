-- Keep the food picker useful for everyday shared-house expenses.
INSERT INTO sl_categories(space_id,kind,stable_key,position)
SELECT s.id,'food','tea',8
FROM sl_spaces s
WHERE NOT EXISTS (
  SELECT 1 FROM sl_categories c
  WHERE c.space_id=s.id AND c.kind='food' AND c.stable_key='tea'
);
