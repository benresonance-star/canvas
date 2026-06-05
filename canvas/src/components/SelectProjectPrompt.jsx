import React from 'react';
import { strings } from '../content/strings.js';

export function SelectProjectPrompt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center max-w-md px-6 py-8 rounded-lg border border-border bg-surface/95 shadow-lg pointer-events-none">
        <h2 className="serif text-xl text-primary mb-2">
          {strings.projects.selectProjectTitle}
        </h2>
        <p className="sans text-sm text-secondary">
          {strings.projects.selectProjectBody}
        </p>
      </div>
    </div>
  );
}
