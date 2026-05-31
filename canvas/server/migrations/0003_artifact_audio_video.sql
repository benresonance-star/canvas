-- Retire domain-specific artifact types
UPDATE artifact SET type = 'other'
WHERE type IN ('ncc_clause', 'as_standard', 'bca_amendment');

-- Reclassify media previously stored as other
UPDATE artifact SET type = 'audio'
WHERE type = 'other'
  AND (
    lower(coalesce(metadata->>'filename', '')) ~ '\.(mp3|m4a|aac|wav|ogg|flac)$'
    OR lower(uri) ~ '\.(mp3|m4a|aac|wav|ogg|flac)(\\?|$)'
  );

UPDATE artifact SET type = 'video'
WHERE type = 'other'
  AND (
    lower(coalesce(metadata->>'filename', '')) ~ '\.(mp4|webm|mov)$'
    OR lower(uri) ~ '\.(mp4|webm|mov)(\\?|$)'
  );
