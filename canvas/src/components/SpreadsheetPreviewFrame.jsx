import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { getPreview } from '../lib/previewStore.js';
import { strings } from '../content/strings.js';

export function SpreadsheetPreviewFrame({ card, pinned, isActive, onRehydratePreview, compact = false }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setRows(null);
      try {
        let buf = null;
        if (pinned.previewCacheKey) {
          const blob = await getPreview(pinned.previewCacheKey);
          if (blob) buf = await blob.arrayBuffer();
        }
        if (!buf && pinned.objectUrl) {
          const res = await fetch(pinned.objectUrl);
          buf = await res.arrayBuffer();
        }
        if (!buf && pinned.dataUrl) {
          const res = await fetch(pinned.dataUrl);
          buf = await res.arrayBuffer();
        }
        if (!buf && pinned.previewCacheKey && onRehydratePreview) {
          await onRehydratePreview(card.id, pinned.version, { force: true });
          const blob = await getPreview(pinned.previewCacheKey);
          if (blob) buf = await blob.arrayBuffer();
        }
        if (!buf) {
          if (!cancelled) setError(strings.preview.loadingPdf);
          return;
        }
        const wb = XLSX.read(buf, { type: 'array' });
        if (cancelled) return;
        setSheetNames(wb.SheetNames || []);
        const name = wb.SheetNames[activeSheet] || wb.SheetNames[0];
        const sheet = wb.Sheets[name];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        setRows(data.slice(0, compact ? 30 : 80));
      } catch (e) {
        if (!cancelled) setError(e.message || strings.preview.tooLarge);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card.id, pinned, activeSheet, compact, onRehydratePreview]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-center px-2">
        <p className="serif text-muted text-sm">{error}</p>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="sans text-xs text-muted">{strings.preview.loadingPdf}</p>
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
