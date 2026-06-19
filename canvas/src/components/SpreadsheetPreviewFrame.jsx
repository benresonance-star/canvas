import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useSpreadsheetBuffer } from '../hooks/useSpreadsheetBuffer.js';
import { strings } from '../content/strings.js';

export function SpreadsheetPreviewFrame({ card, pinned, isActive, onRehydratePreview, compact = false }) {
  const { buffer, error, loading } = useSpreadsheetBuffer({ card, pinned, onRehydratePreview });
  const [rows, setRows] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    if (!buffer) {
      setRows(null);
      setParseError(null);
      setSheetNames([]);
      return undefined;
    }

    try {
      const wb = XLSX.read(buffer, { type: 'array' });
      setSheetNames(wb.SheetNames || []);
      const name = wb.SheetNames[activeSheet] || wb.SheetNames[0];
      const sheet = wb.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      setRows(data.slice(0, compact ? 30 : 80));
      setParseError(null);
    } catch (e) {
      setRows(null);
      setParseError(e.message || strings.preview.tooLarge);
    }
  }, [buffer, activeSheet, compact]);

  const displayError = error || parseError;

  if (displayError) {
    return (
      <div className="h-full flex items-center justify-center text-center px-2">
        <p className="serif text-muted text-sm">{displayError}</p>
      </div>
    );
  }

  if (loading || !rows) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="sans text-xs text-muted">{strings.spreadsheet.loading}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0" data-artifact-scroll={isActive ? '' : undefined}>
      {sheetNames.length > 1 && (
        <div className="shrink-0 flex gap-1 px-2 py-1 border-b border-border overflow-x-auto">
          {sheetNames.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveSheet(i);
              }}
              className={`sans text-[9px] px-2 py-0.5 rounded whitespace-nowrap ${
                i === activeSheet ? 'bg-accent text-on-accent' : 'text-muted hover:bg-surface-muted'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className={`flex-1 min-h-0 overflow-auto ${isActive ? '' : 'pointer-events-none'}`}>
        <table className="sans text-[10px] border-collapse w-full">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {(Array.isArray(row) ? row : [row]).map((cell, ci) => (
                  <td
                    key={ci}
                    className="border border-border-subtle px-1.5 py-0.5 text-secondary max-w-[8rem] truncate"
                  >
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
