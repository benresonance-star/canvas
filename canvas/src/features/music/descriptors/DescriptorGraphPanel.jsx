import React, { useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  MUSIC_DESCRIPTORS,
  createDefaultDescriptorGraph,
  driveDescriptorMappings,
  updateDescriptorValue,
} from '../../../../packages/music-core/src/index.js';

export function DescriptorGraphPanel({ descriptorGraph, onChange }) {
  const graph = useMemo(() => createDefaultDescriptorGraph(descriptorGraph), [descriptorGraph]);

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

  return (
    <section className="border border-border bg-surface rounded p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="sans text-[10px] uppercase tracking-wider text-muted">Descriptor Graph</div>
        <SlidersHorizontal size={14} className="text-muted" />
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
        {MUSIC_DESCRIPTORS.map((name) => {
          const descriptor = graph.descriptors[name];
          return (
            <div
              key={name}
              className="min-w-0 border border-border bg-[#151316] rounded-sm p-3 shadow-sm"
              title={`${descriptor.meaning} Affects: ${descriptor.affectedSystems.join(', ')}`}
            >
              <DescriptorDial
                name={name}
                value={descriptor.value}
                onChange={(nextValue) => setValue(name, nextValue)}
              />
              <div className="mt-3 grid gap-1.5">
                {Object.entries(descriptor.mappings).map(([key, value]) => (
                  <label key={key} className="sans text-[10px] text-muted grid grid-cols-[minmax(0,1fr)_4.25rem] gap-1.5 items-center">
                    <span className="truncate">{key}</span>
                    <input
                      type="number"
                      value={formatMappingValue(value)}
                      step="0.01"
                      onChange={(event) => setMapping(name, key, event.target.value)}
                      className="bg-[#211f23] border border-border rounded-sm px-1.5 py-1 text-right text-primary"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DescriptorDial({ name, value, onChange }) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const progress = arcLength * normalized;
  const angle = -135 + normalized * 270;

  return (
    <div className="relative mx-auto grid w-28 justify-items-center">
      <div className="sans text-base font-semibold text-primary truncate max-w-full">{name}</div>
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="8"
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
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            transform="rotate(135 50 50)"
            className="drop-shadow-[0_0_5px_rgba(25,217,230,0.9)]"
          />
          <g transform={`rotate(${angle} 50 50)`}>
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="22"
              stroke="white"
              strokeWidth="8"
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
      <div className="sans text-2xl font-semibold leading-none text-primary tabular-nums">
        {(normalized * 100).toFixed(2)}
      </div>
    </div>
  );
}

function formatMappingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Number(number.toFixed(3));
}
