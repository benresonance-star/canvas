import React, { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { VintageSlider } from '../../../components/VintageSlider.jsx';
import {
  MUSIC_DESCRIPTORS,
  createDefaultBeatAudioRouting,
  createDefaultDescriptorGraph,
  driveDescriptorMappings,
  updateDescriptorValue,
} from '../../../../packages/music-core/src/index.js';

export function DescriptorGraphPanel({
  descriptorGraph,
  audioRouting,
  onChange,
  onChangeAudioRouting,
}) {
  const graph = useMemo(() => createDefaultDescriptorGraph(descriptorGraph), [descriptorGraph]);
  const routing = createDefaultBeatAudioRouting(audioRouting);
  const [expanded, setExpanded] = useState(() => new Set());

  function setValue(name, value) {
    const result = updateDescriptorValue(graph, name, Number(value));
    if (!result.ok) return;
    const descriptor = result.graph.descriptors[name];
    onChange?.({
      ...result.graph,
      descriptors: {
        ...result.graph.descriptors,
        [name]: {
          ...descriptor,
          mappings: driveDescriptorMappings(descriptor, Number(value)),
        },
      },
    });
  }

  function setMapping(name, key, value) {
    const descriptor = graph.descriptors[name];
    onChange?.({
      ...graph,
      descriptors: {
        ...graph.descriptors,
        [name]: {
          ...descriptor,
          mappings: {
            ...descriptor.mappings,
            [key]: Number(value),
          },
        },
      },
      updatedAt: new Date().toISOString(),
    });
  }

  function toggleExpanded(name) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const updateRouting = (patch) => onChangeAudioRouting?.(
    createDefaultBeatAudioRouting({ ...routing, ...patch }),
  );

  return (
    <section className="border border-border bg-surface rounded p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="sans text-[10px] uppercase tracking-wider text-muted">Descriptor Graph</div>
        </div>
        <SlidersHorizontal size={14} className="text-muted shrink-0" />
      </div>
      <div className="border border-border bg-surface-muted rounded p-2 mb-3 grid gap-2">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Modulation</div>
        <label className="sans text-xs text-secondary flex items-center gap-2">
          <input
            type="checkbox"
            checked={!routing.descriptorGraphBypass}
            onChange={(event) => updateRouting({ descriptorGraphBypass: !event.target.checked })}
          />
          Descriptor graph modulation
        </label>
        <label className="sans text-[10px] text-muted grid grid-cols-[6rem_1fr] gap-2 items-center">
          macro depth
          <VintageSlider
            min="0"
            max="1"
            step="0.01"
            value={routing.descriptorMacroDepth}
            onChange={(event) => updateRouting({ descriptorMacroDepth: Number(event.target.value) })}
            disabled={routing.descriptorGraphBypass}
          />
        </label>
        <div className="sans text-[10px] text-muted leading-snug">
          Drives sequencer playback, acoustic space, and temporal FX from the dials below.
        </div>
      </div>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(5.75rem,1fr))]">
        {MUSIC_DESCRIPTORS.map((name) => {
          const descriptor = graph.descriptors[name];
          const isExpanded = expanded.has(name);
          return (
            <div
              key={name}
              className="min-w-0 border border-border bg-surface-muted rounded-sm p-2 shadow-sm"
              title={`${descriptor.meaning} Affects: ${descriptor.affectedSystems.join(', ')}`}
            >
              <DescriptorDial
                name={name}
                value={descriptor.value}
                onChange={(nextValue) => setValue(name, nextValue)}
              />
              <button
                type="button"
                className="mt-1 w-full sans text-[9px] uppercase tracking-wide text-muted hover:text-secondary"
                onClick={() => toggleExpanded(name)}
              >
                {isExpanded ? 'Hide maps' : 'Maps'}
              </button>
              {isExpanded && (
                <div className="mt-1.5 grid gap-1">
                  {Object.entries(descriptor.mappings).map(([key, value]) => (
                    <label key={key} className="sans text-[9px] text-secondary grid grid-cols-[minmax(0,1fr)_3rem] gap-1 items-center">
                      <span className="truncate">{key}</span>
                      <input
                        type="number"
                        value={formatMappingValue(value)}
                        step="0.01"
                        onChange={(event) => setMapping(name, key, event.target.value)}
                        className="bg-surface border border-border rounded-sm px-1 py-0.5 text-right text-[10px] text-primary"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DescriptorDial({ name, value, onChange }) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progress = arcLength * normalized;
  const angle = -135 + normalized * 270;

  return (
    <div className="relative mx-auto grid w-[4.75rem] justify-items-center text-primary">
      <div className="sans text-[10px] font-medium truncate max-w-full leading-tight text-center">{name}</div>
      <div className="relative h-[4.25rem] w-[4.25rem] text-muted">
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform="rotate(135 50 50)"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#19d9e6"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            transform="rotate(135 50 50)"
            className="drop-shadow-[0_0_4px_rgba(25,217,230,0.45)]"
          />
          <g transform={`rotate(${angle} 50 50)`} className="text-primary">
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="28"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </g>
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={normalized}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={name}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>
      <div className="sans text-sm font-semibold leading-none tabular-nums">
        {Math.round(normalized * 100)}
      </div>
    </div>
  );
}

function formatMappingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number(number.toFixed(3));
}
