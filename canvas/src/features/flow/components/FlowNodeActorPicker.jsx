import React from 'react';
import {
  FLOW_NODE_ACTORS,
  normalizeFlowNodeActors,
  toggleFlowNodeActor,
} from '../domain/flowNodeActors.js';

const ACTOR_BUTTON_CLASS =
  'sans inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition';

export function FlowNodeActorPicker({ actors, onChange, ariaLabel }) {
  const selected = normalizeFlowNodeActors(actors);

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {FLOW_NODE_ACTORS.map((actor) => {
        const Icon = actor.icon;
        const isSelected = selected.includes(actor.id);
        return (
          <button
            key={actor.id}
            type="button"
            aria-pressed={isSelected}
            className={`${ACTOR_BUTTON_CLASS} ${
              isSelected
                ? 'border-accent bg-accent/10 text-primary'
                : 'border-border bg-canvas text-secondary hover:border-accent/50'
            }`}
            onClick={() => onChange(toggleFlowNodeActor(selected, actor.id))}
          >
            <Icon size={12} strokeWidth={1.5} />
            {actor.label}
          </button>
        );
      })}
    </div>
  );
}
