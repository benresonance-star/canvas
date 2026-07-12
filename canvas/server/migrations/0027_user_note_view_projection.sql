CREATE OR REPLACE FUNCTION sync_user_note_artifact_views()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  WITH entries AS (
    SELECT 'canvas'::text AS surface, value AS entry
    FROM jsonb_array_elements(COALESCE(NEW.payload->'cards', '[]'::jsonb))
    UNION ALL
    SELECT 'dock'::text AS surface, value AS entry
    FROM jsonb_array_elements(COALESCE(NEW.payload->'stagedSyncCards', '[]'::jsonb))
  ), eligible AS (
    SELECT
      NEW.project_id AS project_id,
      entries.surface,
      entries.entry,
      MIN(version->'artifactRef'->>'id') AS artifact_id
    FROM entries
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.entry->'versions', '[]'::jsonb)) version
    WHERE entries.entry->>'type' = 'user_note'
      AND NULLIF(version->'artifactRef'->>'id', '') IS NOT NULL
    GROUP BY entries.surface, entries.entry
    HAVING COUNT(DISTINCT version->'artifactRef'->>'id') = 1
  ), scoped AS (
    SELECT eligible.*
    FROM eligible
    JOIN artifact ON artifact.id = eligible.artifact_id
    WHERE artifact.project_id IS NULL OR artifact.project_id = eligible.project_id
      AND (
        eligible.surface = 'dock'
        OR (
          NULLIF(eligible.entry->>'x', '') IS NOT NULL
          AND NULLIF(eligible.entry->>'y', '') IS NOT NULL
          AND NULLIF(eligible.entry->>'width', '') IS NOT NULL
          AND NULLIF(eligible.entry->>'height', '') IS NOT NULL
        )
      )
  )
  INSERT INTO artifact_view (
    id, project_id, artifact_id, surface, view_type,
    x, y, width, height, z_index, view_state, version, created_at, updated_at
  )
  SELECT
    md5(project_id || ':' || artifact_id || ':' || surface || ':card'),
    project_id,
    artifact_id,
    surface,
    'card',
    CASE WHEN surface = 'canvas' THEN (entry->>'x')::double precision END,
    CASE WHEN surface = 'canvas' THEN (entry->>'y')::double precision END,
    CASE WHEN surface = 'canvas' THEN (entry->>'width')::double precision END,
    CASE WHEN surface = 'canvas' THEN (entry->>'height')::double precision END,
    CASE WHEN surface = 'canvas' AND NULLIF(entry->>'zIndex', '') IS NOT NULL
      THEN (entry->>'zIndex')::integer END,
    '{}'::jsonb,
    1,
    NOW(),
    NOW()
  FROM scoped
  ON CONFLICT (project_id, artifact_id, surface, view_type)
    WHERE archived_at IS NULL
  DO UPDATE SET
    x = EXCLUDED.x,
    y = EXCLUDED.y,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    z_index = EXCLUDED.z_index,
    view_state = EXCLUDED.view_state,
    version = artifact_view.version + 1,
    updated_at = NOW()
  WHERE (artifact_view.x, artifact_view.y, artifact_view.width, artifact_view.height,
         artifact_view.z_index, artifact_view.view_state)
    IS DISTINCT FROM
        (EXCLUDED.x, EXCLUDED.y, EXCLUDED.width, EXCLUDED.height,
         EXCLUDED.z_index, EXCLUDED.view_state);

  WITH active AS (
    SELECT entries.surface, MIN(version->'artifactRef'->>'id') AS artifact_id
    FROM (
      SELECT 'canvas'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(NEW.payload->'cards', '[]'::jsonb))
      UNION ALL
      SELECT 'dock'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(NEW.payload->'stagedSyncCards', '[]'::jsonb))
    ) entries
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.entry->'versions', '[]'::jsonb)) version
    WHERE entries.entry->>'type' = 'user_note'
      AND NULLIF(version->'artifactRef'->>'id', '') IS NOT NULL
    GROUP BY entries.surface, entries.entry
    HAVING COUNT(DISTINCT version->'artifactRef'->>'id') = 1
  )
  UPDATE artifact_view view
  SET archived_at = NOW(), updated_at = NOW(), version = view.version + 1
  WHERE view.project_id = NEW.project_id
    AND view.view_type = 'card'
    AND view.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM active
      WHERE active.artifact_id = view.artifact_id AND active.surface = view.surface
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canvas_project_user_note_views ON canvas_project_document;
CREATE TRIGGER canvas_project_user_note_views
AFTER INSERT OR UPDATE OF payload ON canvas_project_document
FOR EACH ROW EXECUTE FUNCTION sync_user_note_artifact_views();
