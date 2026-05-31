import React, { useEffect, useState } from 'react';
import { strings } from '../content/strings.js';
import {
  createNote,
  listArtifactNotes,
  isApiAvailable,
} from '../lib/primitivesApi.js';

export function ArtifactNotesPanel({
  artifactRef,
  clusterId,
  onGraphRefresh,
  variant = 'bottom',
}) {
  const [notes, setNotes] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiOk, setApiOk] = useState(null);
  const isSidebar = variant === 'sidebar';

  const load = async () => {
    if (!artifactRef?.id) return;
    setLoading(true);
    try {
      const data = await listArtifactNotes(artifactRef.id);
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setApiOk(await isApiAvailable());
    })();
  }, []);

  useEffect(() => {
    if (apiOk && artifactRef?.id) load();
  }, [apiOk, artifactRef?.id]);

  const handleAdd = async () => {
    if (!body.trim() || !clusterId || !artifactRef) return;
    await createNote(clusterId, {
      target_ref: artifactRef,
      body: body.trim(),
      author_chain: [
        {
          kind: 'human',
          id: 'user:local',
          action: 'created',
          at: new Date().toISOString(),
        },
      ],
    });
    setBody('');
    await load();
    onGraphRefresh?.();
  };

  if (!artifactRef) return null;

  if (apiOk === false) {
    return (
      <p
        className={`sans text-xs text-muted italic ${
          isSidebar ? 'px-4 py-3' : 'px-6 pb-4'
        }`}
      >
        {strings.artifactNotes.apiUnavailable}
      </p>
    );
  }

  return (
    <div
      className={
        isSidebar
          ? 'flex-1 min-h-0 flex flex-col px-4 py-3'
          : 'shrink-0 border-t border-border bg-surface px-6 py-4 max-h-48 overflow-y-auto'
      }
    >
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2 shrink-0">
        {strings.artifactNotes.title}
      </div>
      <div
        className={
          isSidebar
            ? 'flex-1 min-h-0 overflow-y-auto flex flex-col'
            : undefined
        }
      >
        {loading && (
          <p className="sans text-xs text-muted italic">{strings.inspector.loading}</p>
        )}
        {!loading && notes.length === 0 && (
          <p className="sans text-xs text-muted italic mb-2">{strings.artifactNotes.empty}</p>
        )}
        <ul className="space-y-2 mb-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="sans text-xs text-secondary border-l-2 border-accent pl-2 whitespace-pre-wrap"
            >
              {n.body}
            </li>
          ))}
        </ul>
        <div className={isSidebar ? 'flex flex-col gap-2 shrink-0 mt-auto pt-2' : 'flex gap-2'}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={strings.artifactNotes.placeholder}
            className="flex-1 sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 min-h-[3rem] text-primary resize-y w-full"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!body.trim()}
            className={`sans text-xs bg-accent text-on-accent px-3 py-1.5 rounded disabled:opacity-50 ${
              isSidebar ? 'w-full' : 'self-end'
            }`}
          >
            {strings.artifactNotes.add}
          </button>
        </div>
      </div>
    </div>
  );
}
