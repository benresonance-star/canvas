import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { fetchProjectUpdates, liveProjectStreamUrl, markAllProjectUpdatesRead, markProjectUpdateRead } from '../api/liveApi.js';

export function ProjectUpdateFlag({ projectId, onOpenLiveArtifact }) {
  const [updates, setUpdates] = useState([]);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(async () => {
    if (!projectId) return setUpdates([]);
    setUpdates((await fetchProjectUpdates(projectId, true)).updates);
  }, [projectId]);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  useEffect(() => {
    if (!projectId || typeof EventSource === 'undefined') return undefined;
    const stream = new EventSource(liveProjectStreamUrl(projectId));
    stream.addEventListener('project_update_created', () => void refresh());
    return () => stream.close();
  }, [projectId, refresh]);
  return <div className="relative"><button type="button" aria-label="Project updates" onClick={() => { const next = !open; setOpen(next); if (next) void refresh(); }} className="relative p-1.5 text-muted hover:text-secondary"><Bell size={14} />{updates.length > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-on-accent text-[9px] flex items-center justify-center">{updates.length}</span>}</button>{open && <div className="absolute left-0 top-full mt-2 w-80 max-h-80 overflow-y-auto bg-surface border border-border rounded-lg shadow-2xl p-2 z-50"><div className="flex justify-between p-2"><span className="sans text-[10px] uppercase tracking-wider text-muted">Project updates</span>{updates.length > 0 && <button onClick={async () => { await markAllProjectUpdatesRead(projectId); await refresh(); }} className="text-[10px] text-accent">Mark all read</button>}</div>{updates.length ? updates.map((update) => <button key={update.id} className="w-full text-left p-2 rounded hover:bg-surface-muted" onClick={async () => { await markProjectUpdateRead(update.id); onOpenLiveArtifact?.(update.liveArtifactId); await refresh(); }}><div className="text-xs text-primary">{update.title}</div><div className="text-[10px] text-muted line-clamp-2">{update.body}</div></button>) : <p className="p-3 text-xs text-muted">No unread updates.</p>}</div>}</div>;
}
