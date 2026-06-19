import React, { Suspense, lazy } from 'react';
import { strings } from '../content/strings.js';
import { useSpreadsheetViewerPreference } from '../hooks/useSpreadsheetViewerPreference.js';
import { isCsvSpreadsheet } from '../lib/spreadsheetViewer.js';
import { SpreadsheetPreviewFrame } from './SpreadsheetPreviewFrame.jsx';
import { SpreadsheetViewerSelect } from './SpreadsheetViewerSelect.jsx';

const ExtendSpreadsheetPreviewFrame = lazy(() =>
  import('./ExtendSpreadsheetPreviewFrame.jsx').then((m) => ({
    default: m.ExtendSpreadsheetPreviewFrame,
  })),
);

export function SpreadsheetArtifactView({
  card,
  pinned,
  isActive,
  cardSelected = false,
  onRehydratePreview,
  compact = false,
  showViewerSelect = false,
  inCard = false,
}) {
  const { viewer, setViewer } = useSpreadsheetViewerPreference();
  const allowExtend = !isCsvSpreadsheet(pinned);
  const effectiveViewer = allowExtend && viewer === 'extend' ? 'extend' : 'simple';

  return (
    <div className="h-full flex flex-col min-h-0">
      {showViewerSelect && (
        <div
          className="shrink-0 flex items-center justify-end gap-2 px-2 py-1 border-b border-border"
          data-card-artifact-controls=""
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <SpreadsheetViewerSelect
            value={effectiveViewer}
            onChange={setViewer}
            compact={compact}
            allowExtend={allowExtend}
          />
        </div>
      )}
      <div className="flex-1 min-h-0">
        {effectiveViewer === 'extend' ? (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center">
                <p className="sans text-xs text-muted">{strings.spreadsheet.loading}</p>
              </div>
            }
          >
            <ExtendSpreadsheetPreviewFrame
              card={card}
              pinned={pinned}
              isActive={isActive}
              cardSelected={cardSelected}
              onRehydratePreview={onRehydratePreview}
              compact={compact}
              inCard={inCard}
            />
          </Suspense>
        ) : (
          <SpreadsheetPreviewFrame
            card={card}
            pinned={pinned}
            isActive={isActive}
            onRehydratePreview={onRehydratePreview}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
}
