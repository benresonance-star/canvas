import React from 'react';
import { strings } from '../content/strings.js';
import { cardLabel } from '../lib/agentContext.js';

function deliverySuffix(status) {
  if (status === 'sends_on_next' || status === 'updated_resend') {
    return strings.agent.threadContextPending;
  }
  return null;
}

/**
 * Live index of artefacts in scope for the active chat thread.
 */
export function ThreadContextBar({
  cards = [],
  deliveryByCardId = {},
  onFocusCard,
}) {
  if (!cards.length) {
    return (
      <div className="shrink-0 px-1 py-1 border-b border-border-subtle bg-surface-muted/20">
        <p className="sans text-[9px] text-muted leading-snug">
          {strings.agent.threadContextEmpty}
        </p>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-1 py-1 border-b border-border-subtle bg-surface-muted/20">
      <p className="sans text-[9px] uppercase tracking-wider text-muted">
        {strings.agent.threadContextHeading}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" role="list">
        {cards.map((card) => {
          const delivery = deliveryByCardId[card.id];
          const pending = deliverySuffix(delivery);
          const label = cardLabel(card);
          const ChipTag = onFocusCard ? 'button' : 'span';
          return (
            <li key={card.id}>
              <ChipTag
                type={onFocusCard ? 'button' : undefined}
                onClick={onFocusCard ? () => onFocusCard(card.id) : undefined}
                title={label}
                className={`sans text-[10px] max-w-[11rem] truncate rounded-full border border-border-subtle bg-surface-muted text-secondary px-2 py-0.5 ${
                  onFocusCard ? 'hover:border-border hover:bg-surface cursor-pointer' : ''
                }`}
              >
                {label}
                {pending ? (
                  <span className="text-muted italic"> · {pending}</span>
                ) : null}
              </ChipTag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
