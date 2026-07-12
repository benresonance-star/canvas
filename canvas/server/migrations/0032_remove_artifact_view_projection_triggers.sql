CREATE OR REPLACE FUNCTION prepare_user_note_artifact_view_document(
  target_project_id TEXT,
  document_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  note_row RECORD;
  current_view artifact_view%ROWTYPE;
  contracted_cards JSONB;
BEGIN
  FOR note_row IN
    WITH entries AS (
      SELECT 'canvas'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(document_payload->'cards', '[]'::jsonb))
      UNION ALL
      SELECT 'dock'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(document_payload->'stagedSyncCards', '[]'::jsonb))
    )
    SELECT
      entries.surface,
      entries.entry,
      MIN(version_value->'artifactRef'->>'id') AS artifact_id
    FROM entries
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.entry->'versions', '[]'::jsonb))
      AS versions(version_value)
    WHERE entries.entry->>'type' = 'user_note'
      AND NULLIF(version_value->'artifactRef'->>'id', '') IS NOT NULL
    GROUP BY entries.surface, entries.entry
    HAVING COUNT(DISTINCT version_value->'artifactRef'->>'id') = 1
  LOOP
    current_view := NULL;
    SELECT view.* INTO current_view
    FROM artifact_view view
    WHERE view.project_id = target_project_id
      AND view.artifact_id = note_row.artifact_id
      AND view.view_type = 'card'
      AND view.archived_at IS NULL
    FOR UPDATE;

    IF current_view.id IS NULL THEN
      IF note_row.surface = 'canvas' AND (
        NULLIF(note_row.entry->>'x', '') IS NULL
        OR NULLIF(note_row.entry->>'y', '') IS NULL
        OR NULLIF(note_row.entry->>'width', '') IS NULL
        OR NULLIF(note_row.entry->>'height', '') IS NULL
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'new canonical canvas note requires geometry';
      END IF;
      INSERT INTO artifact_view (
        id, project_id, artifact_id, surface, view_type,
        x, y, width, height, z_index, view_state, version, created_at, updated_at
      ) VALUES (
        md5(target_project_id || ':' || note_row.artifact_id || ':' || note_row.surface || ':card'),
        target_project_id,
        note_row.artifact_id,
        note_row.surface,
        'card',
        CASE WHEN note_row.surface = 'canvas' THEN (note_row.entry->>'x')::double precision END,
        CASE WHEN note_row.surface = 'canvas' THEN (note_row.entry->>'y')::double precision END,
        CASE WHEN note_row.surface = 'canvas' THEN (note_row.entry->>'width')::double precision END,
        CASE WHEN note_row.surface = 'canvas' THEN (note_row.entry->>'height')::double precision END,
        CASE WHEN note_row.surface = 'canvas' AND NULLIF(note_row.entry->>'zIndex', '') IS NOT NULL
          THEN (note_row.entry->>'zIndex')::integer END,
        '{}'::jsonb, 1, NOW(), NOW()
      );
    ELSIF current_view.surface <> note_row.surface THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'artifact view surface must be changed by an explicit transfer command';
    ELSIF note_row.surface = 'canvas'
      AND NULLIF(note_row.entry->>'x', '') IS NOT NULL
      AND (
        current_view.x,
        current_view.y,
        current_view.width,
        current_view.height,
        COALESCE(current_view.z_index, 0)
      ) IS DISTINCT FROM (
        (note_row.entry->>'x')::double precision,
        (note_row.entry->>'y')::double precision,
        (note_row.entry->>'width')::double precision,
        (note_row.entry->>'height')::double precision,
        COALESCE(NULLIF(note_row.entry->>'zIndex', '')::integer, 0)
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'artifact view geometry must be changed by an explicit placement command';
    END IF;
  END LOOP;

  WITH active AS (
    SELECT entries.surface, MIN(version_value->'artifactRef'->>'id') AS artifact_id
    FROM (
      SELECT 'canvas'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(document_payload->'cards', '[]'::jsonb))
      UNION ALL
      SELECT 'dock'::text AS surface, value AS entry
      FROM jsonb_array_elements(COALESCE(document_payload->'stagedSyncCards', '[]'::jsonb))
    ) entries
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.entry->'versions', '[]'::jsonb))
      AS versions(version_value)
    WHERE entries.entry->>'type' = 'user_note'
      AND NULLIF(version_value->'artifactRef'->>'id', '') IS NOT NULL
    GROUP BY entries.surface, entries.entry
    HAVING COUNT(DISTINCT version_value->'artifactRef'->>'id') = 1
  )
  UPDATE artifact_view view
  SET archived_at = NOW(), updated_at = NOW(), version = view.version + 1
  WHERE view.project_id = target_project_id
    AND view.view_type = 'card'
    AND view.archived_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM active
      WHERE active.artifact_id = view.artifact_id AND active.surface = view.surface
    );

  SELECT COALESCE(jsonb_agg(
    CASE WHEN card_value->>'type' = 'user_note'
      THEN card_value - 'x' - 'y' - 'width' - 'height' - 'zIndex' - 'artifactViewVersion'
      ELSE card_value - 'artifactViewVersion'
    END ORDER BY ordinal
  ), '[]'::jsonb)
  INTO contracted_cards
  FROM jsonb_array_elements(COALESCE(document_payload->'cards', '[]'::jsonb))
    WITH ORDINALITY AS cards(card_value, ordinal);

  document_payload := jsonb_set(document_payload, '{cards}', contracted_cards, true);
  document_payload := jsonb_set(
    document_payload,
    '{stagedSyncCards}',
    COALESCE((
      SELECT jsonb_agg(staged_value - 'artifactViewVersion' ORDER BY ordinal)
      FROM jsonb_array_elements(COALESCE(document_payload->'stagedSyncCards', '[]'::jsonb))
        WITH ORDINALITY AS staged(staged_value, ordinal)
    ), '[]'::jsonb),
    true
  );
  RETURN document_payload;
END;
$$;

DROP TRIGGER IF EXISTS canvas_project_user_note_views ON canvas_project_document;
DROP TRIGGER IF EXISTS zz_canvas_project_strip_user_note_geometry ON canvas_project_document;
DROP FUNCTION IF EXISTS sync_user_note_artifact_views();
DROP FUNCTION IF EXISTS strip_user_note_compatibility_geometry();
DROP TABLE IF EXISTS canvas_runtime_setting;
