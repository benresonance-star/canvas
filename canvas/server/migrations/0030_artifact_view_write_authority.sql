CREATE TABLE IF NOT EXISTS canvas_runtime_setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO canvas_runtime_setting (key, value)
VALUES ('artifact_view_write_authority', 'projection')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_user_note_artifact_views()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  authority_mode TEXT;
  mismatch_count INTEGER;
BEGIN
  SELECT value INTO authority_mode
  FROM canvas_runtime_setting
  WHERE key = 'artifact_view_write_authority';
  authority_mode := COALESCE(authority_mode, 'projection');

  IF authority_mode NOT IN ('projection', 'verification') THEN
    RAISE EXCEPTION 'invalid artifact_view_write_authority: %', authority_mode;
  END IF;

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
    WHERE (artifact.project_id IS NULL OR artifact.project_id = eligible.project_id)
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
    project_id, artifact_id, surface, 'card',
    CASE WHEN surface = 'canvas' THEN (entry->>'x')::double precision END,
    CASE WHEN surface = 'canvas' THEN (entry->>'y')::double precision END,
    CASE WHEN surface = 'canvas' THEN (entry->>'width')::double precision END,
    CASE WHEN surface = 'canvas' THEN (entry->>'height')::double precision END,
    CASE WHEN surface = 'canvas' AND NULLIF(entry->>'zIndex', '') IS NOT NULL
      THEN (entry->>'zIndex')::integer END,
    '{}'::jsonb, 1, NOW(), NOW()
  FROM scoped
  WHERE authority_mode = 'projection'
    OR NOT EXISTS (
      SELECT 1 FROM artifact_view existing
      WHERE existing.project_id = scoped.project_id
        AND existing.artifact_id = scoped.artifact_id
        AND existing.view_type = 'card'
        AND existing.archived_at IS NULL
    )
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
  WHERE authority_mode = 'projection'
    AND (artifact_view.x, artifact_view.y, artifact_view.width, artifact_view.height,
         artifact_view.z_index, artifact_view.view_state)
      IS DISTINCT FROM
        (EXCLUDED.x, EXCLUDED.y, EXCLUDED.width, EXCLUDED.height,
         EXCLUDED.z_index, EXCLUDED.view_state);

  IF authority_mode = 'verification' THEN
    WITH entries AS (
      SELECT 'canvas'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(NEW.payload->'cards', '[]'::jsonb))
      UNION ALL
      SELECT 'dock'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(NEW.payload->'stagedSyncCards', '[]'::jsonb))
    ), eligible AS (
      SELECT
        entries.surface,
        entries.entry,
        MIN(version->'artifactRef'->>'id') AS artifact_id
      FROM entries
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.entry->'versions', '[]'::jsonb)) version
      WHERE entries.entry->>'type' = 'user_note'
        AND NULLIF(version->'artifactRef'->>'id', '') IS NOT NULL
      GROUP BY entries.surface, entries.entry
      HAVING COUNT(DISTINCT version->'artifactRef'->>'id') = 1
    )
    SELECT COUNT(*) INTO mismatch_count
    FROM eligible
    LEFT JOIN artifact_view view
      ON view.project_id = NEW.project_id
      AND view.artifact_id = eligible.artifact_id
      AND view.surface = eligible.surface
      AND view.view_type = 'card'
      AND view.archived_at IS NULL
    WHERE view.id IS NULL
      OR (
        eligible.surface = 'canvas'
        AND (view.x, view.y, view.width, view.height, COALESCE(view.z_index, 0))
          IS DISTINCT FROM (
            (eligible.entry->>'x')::double precision,
            (eligible.entry->>'y')::double precision,
            (eligible.entry->>'width')::double precision,
            (eligible.entry->>'height')::double precision,
            COALESCE(NULLIF(eligible.entry->>'zIndex', '')::integer, 0)
          )
      );

    IF mismatch_count > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format(
          'artifact view authority rejected %s legacy placement mutation(s)',
          mismatch_count
        );
    END IF;
  END IF;

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
