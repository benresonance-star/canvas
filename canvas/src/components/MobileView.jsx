import React, { useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { cardTypeLabel, isCardMissingFromFolder } from '../lib/filename.js';
import { strings } from '../content/strings.js';
import { TypeIcon } from './TypeIcon.jsx';

export function MobileView({ cards, onOpen, onPinVersion, onDeleteCard, folderKeySet, folderConnected }) {
  const isMissing = useCallback(
    (card) =>
      isCardMissingFromFolder({ folderConnected, folderKeySet, card }),
    [folderConnected, folderKeySet],
  );
  const grouped = useMemo(() => {
    const g = {};
    cards.forEach(c => {
      if (!g[c.prefix]) g[c.prefix] = [];
      g[c.prefix].push(c);
    });
    return g;
  }, [cards]);
  
  return (
    <div className="absolute inset-0 pt-16 pb-6 overflow-y-auto">
      <div className="px-4 space-y-8">
        {Object.entries(grouped).map(([prefix, items]) => (
          <div key={prefix}>
            <div className="sans text-[10px] uppercase tracking-[0.18em] text-muted mb-3 px-1">
              {prefix}
            </div>
            <div className="space-y-2">
              {items.map(card => {
                const hasNewer = card.versions.some(v => v.version > card.pinnedVersion);
                const missing = isMissing(card);
                return (
                  <div
                    key={card.id}
                    className={`w-full flex items-stretch gap-2 rounded-lg ${missing ? 'ring-2 ring-danger-ring' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(card.id)}
                      className="flex-1 min-w-0 bg-surface card-shadow rounded-lg p-4 text-left active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div className={`serif text-base truncate flex-1 ${missing ? 'text-danger' : 'text-primary'}`}>{card.name}</div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="sans text-[10px] text-muted">v{card.pinnedVersion}</span>
                          <div className="w-1 h-1 rounded-full pin-dot"></div>
                        </div>
                      </div>
                      <div className="sans text-[10px] text-muted flex items-center gap-2">
                        <TypeIcon type={card.type} className="text-muted" />
                        <span>{cardTypeLabel(card.type)}</span>
                        {card.versions.length > 1 && (
                          <>
                            <span>·</span>
                            <span>{card.versions.length} versions</span>
                            {hasNewer && <span className="text-accent">{strings.card.newerDraft}</span>}
                          </>
                        )}
                      </div>
                    </button>
                    {missing && (
                      <button
                        type="button"
                        title={strings.card.removeFromCanvas}
                        onClick={() => onDeleteCard(card.id)}
                        className="self-stretch px-3 flex items-center justify-center bg-surface card-shadow rounded-lg text-danger hover:bg-danger-muted shrink-0"
                      >
                        <Trash2 size={18} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}