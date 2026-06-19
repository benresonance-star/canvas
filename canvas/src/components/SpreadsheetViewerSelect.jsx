import React from 'react';
import { strings } from '../content/strings.js';

export function SpreadsheetViewerSelect({
  value,
  onChange,
  compact = false,
  allowExtend = true,
  className = '',
}) {
  const selectClass = compact
    ? 'sans bg-accent text-on-accent text-[9px] rounded px-1.5 py-0.5 border border-border'
    : 'sans bg-accent text-on-accent text-xs rounded px-2 py-1.5 border border-border';

  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`sans text-muted ${compact ? 'text-[9px]' : 'text-xs'}`}>
        {strings.spreadsheet.viewerLabel}
      </span>
      <select
        value={allowExtend ? value : 'simple'}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        aria-label={strings.spreadsheet.viewerLabel}
        className={selectClass}
      >
        <option value="simple">{strings.spreadsheet.viewerSimple}</option>
        {allowExtend ? <option value="extend">{strings.spreadsheet.viewerExtend}</option> : null}
      </select>
    </label>
  );
}
