import React, { useMemo } from 'react';
import { cardHeaderLabel, cardHeaderPrefix, cardDisplayFilename } from '../lib/filename.js';
import { getSearchShortcutKeys } from '../lib/searchShortcut.js';
import { strings } from '../content/strings.js';

const kbdClass =
  'sans text-[10px] text-muted border border-border rounded px-1.5 py-0.5 bg-surface-muted leading-none font-normal';

export function SearchOverlay({ query, setQuery, cards, onSelect, onClose }) {
  const shortcutKeys = useMemo(() => getSearchShortcutKeys(), []);

  const matches = useMemo(() => {
    if (!query.trim()) return cards.slice(0, 8);
    const q = query.toLowerCase();
    return cards.filter(
      (c) => c.name.toLowerCase().includes(q)
        || cardDisplayFilename(c).toLowerCase().includes(q)
        || c.prefix.toLowerCase().includes(q)
        || cardHeaderPrefix(c).toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query, cards]);

  return (
    <div
      className="fixed inset-0 z-40 bg-[var(--color-overlay-light)] backdrop-blur-sm flex items-start justify-center pt-32"
      onClick={onClose}
    >
      <div className="bg-surface rounded-lg w-full max-w-md mx-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="relative border-b border-border">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={strings.search.placeholder}
            className="sans w-full pl-5 pr-20 py-4 text-base outline-none text-primary bg-transparent"
          />
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none"
            aria-hidden
          >
            <kbd className={kbdClass}>{shortcutKeys.modifier}</kbd>
            <kbd className={kbdClass}>{shortcutKeys.key}</kbd>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="serif italic text-muted text-sm px-5 py-4">{strings.search.noMatches}</div>
          ) : (
            matches.map(card => (
              <button
                key={card.id}
                onClick={() => onSelect(card)}
                className="w-full text-left px-5 py-3 hover:bg-surface-muted transition flex items-center justify-between"
              >
                <div className="min-w-0">
                  <div className="sans text-[10px] uppercase tracking-wider text-muted mb-0.5">{cardHeaderLabel(card)}</div>
                  <div className="serif text-sm text-primary truncate">{cardDisplayFilename(card)}</div>
                </div>
                <span className="sans text-[10px] text-muted">v{card.pinnedVersion}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
