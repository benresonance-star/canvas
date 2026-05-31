import React from 'react';
import { strings } from '../content/strings.js';

export function EmptyWorkspacePrompt({ onCreateProject }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="pointer-events-auto text-center max-w-md px-6 py-8 rounded-lg border border-border bg-surface/95 shadow-lg">
        <h2 className="serif text-xl text-primary mb-2">{strings.projects.emptyWorkspaceTitle}</h2>
        <p className="sans text-sm text-secondary mb-6">{strings.projects.emptyWorkspaceBody}</p>
        <button
          type="button"
          onClick={onCreateProject}
          className="sans text-xs uppercase tracking-wider bg-accent-muted text-accent border border-accent-border px-5 py-2.5 rounded transition hover:opacity-90"
        >
          {strings.projects.createFirstProject}
        </button>
      </div>
    </div>
  );
}
