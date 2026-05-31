-- Deduplicate relationships: keep oldest row per (from, to, type).
WITH duplicates AS (
  SELECT r.id
  FROM relationship r
  INNER JOIN relationship r2
    ON r.from_id = r2.from_id
   AND r.from_type = r2.from_type
   AND r.to_id = r2.to_id
   AND r.to_type = r2.to_type
   AND r.type = r2.type
   AND r.created_at > r2.created_at
)
DELETE FROM provenance
WHERE primitive_type = 'relationship'
  AND primitive_id IN (SELECT id FROM duplicates);

WITH duplicates AS (
  SELECT r.id
  FROM relationship r
  INNER JOIN relationship r2
    ON r.from_id = r2.from_id
   AND r.from_type = r2.from_type
   AND r.to_id = r2.to_id
   AND r.to_type = r2.to_type
   AND r.type = r2.type
   AND r.created_at > r2.created_at
)
DELETE FROM cluster_member
WHERE primitive_type = 'relationship'
  AND primitive_id IN (SELECT id FROM duplicates);

DELETE FROM relationship r
USING relationship r2
WHERE r.from_id = r2.from_id
  AND r.from_type = r2.from_type
  AND r.to_id = r2.to_id
  AND r.to_type = r2.to_type
  AND r.type = r2.type
  AND r.created_at > r2.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS relationship_endpoints_type_uidx
  ON relationship (from_id, from_type, to_id, to_type, type);
