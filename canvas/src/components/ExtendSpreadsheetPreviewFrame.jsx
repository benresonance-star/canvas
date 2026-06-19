import React, { useLayoutEffect, useRef, useState } from 'react';
import { XlsxViewer } from '@extend-ai/react-xlsx';
import '../lib/xlsxWasm.js';
import { useSpreadsheetBuffer } from '../hooks/useSpreadsheetBuffer.js';
import { useTheme } from '../hooks/useTheme.js';
import {
  resolveSpreadsheetViewerIsDark,
  spreadsheetSelectionColors,
} from '../lib/spreadsheetViewerTheme.js';
import { strings } from '../content/strings.js';

export function ExtendSpreadsheetPreviewFrame({
  card,
  pinned,
  isActive,
  cardSelected = false,
  onRehydratePreview,
  compact = false,
  inCard = false,
}) {
  const { theme } = useTheme();
  const { buffer, error, loading, fileName } = useSpreadsheetBuffer({
    card,
    pinned,
    onRehydratePreview,
  });
  const containerRef = useRef(null);
  const [selectionColors, setSelectionColors] = useState(() => spreadsheetSelectionColors());
  const [isDark, setIsDark] = useState(false);
  const canInteract = isActive || cardSelected;

  const pointerEventsClass = inCard ? '' : (canInteract ? '' : 'pointer-events-none');
  const artifactScrollEnabled = inCard ? cardSelected || isActive : canInteract;

  useLayoutEffect(() => {
    const root = containerRef.current ?? document.documentElement;
    setIsDark(resolveSpreadsheetViewerIsDark(root));
    setSelectionColors(spreadsheetSelectionColors(root));
  }, [theme, inCard, buffer]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-center px-2">
        <p className="serif text-muted text-sm">{error}</p>
      </div>
    );
  }

  if (loading || !buffer) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="sans text-xs text-muted">{strings.spreadsheet.loading}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`canvas-xlsx-viewer h-full min-h-0 flex flex-col ${pointerEventsClass}`}
      data-artifact-scroll={artifactScrollEnabled ? '' : undefined}
      data-card-artifact-controls=""
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <XlsxViewer
        key={isDark ? 'dark' : 'light'}
        className="flex-1 min-h-0"
        file={buffer}
        fileName={fileName}
        height="100%"
        readOnly
        rounded={false}
        isDark={isDark}
        showDefaultToolbar={inCard ? true : !compact}
        selectionColor={selectionColors.selectionColor}
        selectionFillColor={selectionColors.selectionFillColor}
        selectionHeaderColor={selectionColors.selectionHeaderColor}
        loadingState={
          <div className="h-full flex items-center justify-center">
            <p className="sans text-xs text-muted">{strings.spreadsheet.loading}</p>
          </div>
        }
        errorState={(err) => (
          <div className="h-full flex items-center justify-center text-center px-2">
            <p className="serif text-muted text-sm">{err.message || strings.spreadsheet.extendLoadFailed}</p>
          </div>
        )}
      />
    </div>
  );
}
