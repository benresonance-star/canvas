CREATE OR REPLACE FUNCTION strip_user_note_compatibility_geometry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  authority_mode TEXT;
  stripped_cards JSONB;
BEGIN
  SELECT value INTO authority_mode
  FROM canvas_runtime_setting
  WHERE key = 'artifact_view_write_authority';

  IF COALESCE(authority_mode, 'projection') <> 'verification' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN card_value->>'type' = 'user_note'
        AND (
          SELECT COUNT(DISTINCT version_value->'artifactRef'->>'id') = 1
          FROM jsonb_array_elements(COALESCE(card_value->'versions', '[]'::jsonb))
            AS versions(version_value)
          WHERE NULLIF(version_value->'artifactRef'->>'id', '') IS NOT NULL
        )
        AND EXISTS (
          SELECT 1
          FROM artifact_view view
          WHERE view.project_id = NEW.project_id
            AND view.artifact_id = (
              SELECT MIN(version_value->'artifactRef'->>'id')
              FROM jsonb_array_elements(COALESCE(card_value->'versions', '[]'::jsonb))
                AS versions(version_value)
              WHERE NULLIF(version_value->'artifactRef'->>'id', '') IS NOT NULL
            )
            AND view.surface = 'canvas'
            AND view.view_type = 'card'
            AND view.archived_at IS NULL
        )
      THEN card_value - 'x' - 'y' - 'width' - 'height' - 'zIndex' - 'artifactViewVersion'
      ELSE card_value - 'artifactViewVersion'
    END
    ORDER BY ordinal
  ), '[]'::jsonb)
  INTO stripped_cards
  FROM jsonb_array_elements(COALESCE(NEW.payload->'cards', '[]'::jsonb))
    WITH ORDINALITY AS cards(card_value, ordinal);

  NEW.payload := jsonb_set(NEW.payload, '{cards}', stripped_cards, true);
  NEW.payload := jsonb_set(
    NEW.payload,
    '{stagedSyncCards}',
    COALESCE((
      SELECT jsonb_agg(staged_value - 'artifactViewVersion' ORDER BY ordinal)
      FROM jsonb_array_elements(COALESCE(NEW.payload->'stagedSyncCards', '[]'::jsonb))
        WITH ORDINALITY AS staged(staged_value, ordinal)
    ), '[]'::jsonb),
    true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canvas_project_user_note_views ON canvas_project_document;
CREATE TRIGGER canvas_project_user_note_views
BEFORE INSERT OR UPDATE OF payload ON canvas_project_document
FOR EACH ROW EXECUTE FUNCTION sync_user_note_artifact_views();

DROP TRIGGER IF EXISTS zz_canvas_project_strip_user_note_geometry ON canvas_project_document;
CREATE TRIGGER zz_canvas_project_strip_user_note_geometry
BEFORE INSERT OR UPDATE OF payload ON canvas_project_document
FOR EACH ROW EXECUTE FUNCTION strip_user_note_compatibility_geometry();

-- Re-run every document through the ordered verification + stripping triggers.
UPDATE canvas_project_document SET payload = payload;
