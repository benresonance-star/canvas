import React from 'react';

export function FieldRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="py-1.5 border-b border-border-subtle last:border-0">
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-0.5">{label}</div>
      <div className="sans text-xs text-secondary break-all">{String(value)}</div>
    </div>
  );
}
