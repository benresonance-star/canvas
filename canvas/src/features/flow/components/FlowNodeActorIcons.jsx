import React from 'react';
import { flowLocalNodeHeaderUsesDarkText } from '../domain/flowLocalNodeTypeColors.js';
import { flowNodeActorMetas } from '../domain/flowNodeActors.js';

export function FlowNodeActorIcons({ actors, headerColor }) {
  const metas = flowNodeActorMetas(actors);
  if (!metas.length) return null;

  const onColoredHeader = Boolean(headerColor);
  const iconClass = onColoredHeader
    ? (flowLocalNodeHeaderUsesDarkText(headerColor) ? 'text-primary/80' : 'text-white/90')
    : 'text-secondary';

  return (
    <div className="flex flex-wrap items-center gap-1 mb-1" aria-label="Node actors">
      {metas.map((actor) => {
        const Icon = actor.icon;
        return (
          <span
            key={actor.id}
            title={actor.label}
            className={`inline-flex items-center justify-center rounded-full border border-current/20 px-1 py-0.5 ${iconClass}`}
          >
            <Icon size={11} strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{actor.label}</span>
          </span>
        );
      })}
    </div>
  );
}
