import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { strings } from '../content/strings.js';
import { saveUserNote } from '../lib/ingest/saveUserNote.js';
import { noteRequiresProjectOnlySave } from '../lib/filename.js';
import { markdownViewToggleLabel } from '../lib/markdownMessage.js';
import { EditableMarkdownMessage } from './EditableMarkdownMessage.jsx';

export const UserNoteEditor = forwardRef(function UserNoteEditor({
  card,
  version,
  versionNum,
  title,
  folderHandle,
  folderConnected = false,
  folderKeySet = null,
  projectId,
  projectName,
  clusterId,
  cards,
  missingFromFolder,
  userNoteDisabled = false,
  onUpdateVersion,
  onUpdateCard,
  onGraphRefresh,
  onSaveStatus,
  onCancelEdit,
  onSaveToProject,
}, ref) {
  const initialBody = version?.content ?? '';
  const initialName = card?.name ?? '';
  const draftKey = `${card.id}:${versionNum}:${initialBody}`;
  const [lastDraftKey, setLastDraftKey] = useState(draftKey);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formattedView, setFormattedView] = useState(() => Boolean(initialBody));

  if (lastDraftKey !== draftKey) {
    setLastDraftKey(draftKey);
    setBody(initialBody);
    setFormattedView(Boolean(initialBody));
    setError(null);
  }

  const bodyDirty = body !== initialBody;
  const nameDirty = (title ?? '') !== initialName;
  const dirty = bodyDirty || nameDirty;
  const projectOnly = noteRequiresProjectOnlySave({
    folderHandle,
    folderConnected,
    folderKeySet,
    card,
  });
  const editBlocked = userNoteDisabled;
  const canSave = dirty && !saving && !editBlocked && (projectOnly || Boolean(folderHandle && version?.filename));

  const handleSave = async () => {
    if (!dirty || saving || !canSave) return;
    if (projectOnly) {
      setSaving(true);
      setError(null);
      try {
        const result = await onSaveToProject?.({
          body,
          name: title,
          versionNum,
        });
        if (!result?.ok) {
          if (result?.reason === 'name_required') {
            setError(strings.userNote.nameRequired);
          } else if (result?.reason === 'name_invalid') {
            setError(strings.userNote.nameInvalid);
          } else {
            setError(strings.userNote.saveFailed);
          }
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveUserNote({
        projectId,
        projectName,
        folderHandle,
        clusterId,
        card,
        versionNum,
        body,
        name: title,
        cards,
      });
      if (result.reason === 'no_folder') {
        setError(strings.userNote.needFolder);
        return;
      }
      if (result.reason === 'write_denied') {
        setError(strings.userNote.writeDenied);
        return;
      }
      if (result.reason === 'name_required') {
        setError(strings.userNote.nameRequired);
        return;
      }
      if (result.reason === 'name_invalid') {
        setError(strings.userNote.nameInvalid);
        return;
      }
      if (result.reason === 'name_collision') {
        setError(strings.userNote.nameCollision);
        return;
      }
      if (!result.ok) {
        setError(strings.userNote.saveFailed);
        return;
      }
      if (result.cardUpdates) {
        onUpdateCard?.(result.cardUpdates);
      } else {
        onUpdateVersion?.(result.versionNum, result.version);
      }
      if (result.apiUnavailable) {
        onSaveStatus?.({ toast: strings.sync.primitivesNotUpdated });
      } else {
        onSaveStatus?.({ toast: strings.userNote.savedToFolder });
      }
      onGraphRefresh?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setBody(initialBody);
    setError(null);
    onCancelEdit?.();
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useImperativeHandle(ref, () => ({
    saveIfDirty: () => handleSaveRef.current(),
  }));

  return (
    <div className="h-full flex flex-col min-h-0">
      {projectOnly && (
        <p className="sans text-xs text-muted px-12 pt-4 shrink-0">
          {folderHandle && folderKeySet?.size
            ? strings.userNote.savedProjectOnlyMissingFromFolder
            : strings.userNote.savedProjectOnly}
        </p>
      )}
      <p className="sans text-[10px] text-muted px-12 pt-4 shrink-0">
        {strings.userNote.editHint}
      </p>
      <div className="flex-1 min-h-0 px-12 py-4">
        {formattedView ? (
          <div className="h-full min-h-[20rem] overflow-y-auto rounded border border-border bg-surface px-4 py-3 text-primary leading-relaxed">
            <EditableMarkdownMessage
              value={body}
              onChange={setBody}
              disabled={editBlocked || saving}
              toolbarRight={(
                <button
                  type="button"
                  className="sans rounded-full border border-border-subtle bg-surface-muted/90 px-2.5 py-1 text-[10px] text-muted shadow-sm hover:text-primary"
                  onClick={() => setFormattedView(false)}
                  aria-pressed={false}
                >
                  {markdownViewToggleLabel(formattedView)}
                </button>
              )}
            />
          </div>
        ) : (
          <>
            <div className="shrink-0 flex justify-end pb-2">
              <button
                type="button"
                className="sans rounded-full border border-border-subtle bg-surface-muted/90 px-2.5 py-1 text-[10px] text-muted shadow-sm hover:text-primary"
                onClick={() => setFormattedView(true)}
                aria-pressed
              >
                {markdownViewToggleLabel(formattedView)}
              </button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={editBlocked}
              className="w-full h-full min-h-[20rem] sans text-sm bg-surface border border-border rounded px-4 py-3 text-primary font-serif leading-relaxed resize-none disabled:opacity-60 cursor-text"
              placeholder={strings.userNote.bodyPlaceholder}
            />
          </>
        )}
      </div>
      {missingFromFolder && (
        <p className="sans text-xs text-danger px-12 pb-2">{strings.userNote.cannotSaveMissing}</p>
      )}
      {error && (
        <p className="sans text-xs text-danger px-12 pb-2">{error}</p>
      )}
      <footer className="shrink-0 px-12 py-4 border-t border-border-subtle flex justify-end gap-2 bg-canvas">
        <button
          type="button"
          onClick={handleCancel}
          disabled={!dirty || saving}
          className="sans text-xs text-muted px-3 py-1.5 disabled:opacity-40"
        >
          {strings.userNote.cancel}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="sans text-xs bg-accent text-on-accent px-4 py-1.5 rounded disabled:opacity-50"
        >
          {saving ? strings.userNote.saving : strings.userNote.save}
        </button>
      </footer>
    </div>
  );
});
