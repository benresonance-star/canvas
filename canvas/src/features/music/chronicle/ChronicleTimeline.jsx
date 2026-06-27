import React from 'react';
import { History } from 'lucide-react';

export function ChronicleTimeline({ events = [] }) {
  return (
    <section className="border border-border bg-surface rounded p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Chronicle</div>
        <History size={14} className="text-muted" />
      </div>
      <div className="grid gap-2 max-h-80 overflow-auto">
        {events.length === 0 && (
          <div className="sans text-xs text-muted">No chronicle events yet.</div>
        )}
        {events.map((event) => (
          <div key={event.id} className="border-l-2 border-accent/50 pl-2 py-1">
            <div className="sans text-xs text-secondary truncate">{event.summary || event.eventType}</div>
            <div className="sans text-[10px] text-muted">
              {event.eventType} / {event.actorType} / {formatDate(event.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDate(value) {
  if (!value) return 'now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}
