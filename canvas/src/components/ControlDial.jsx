import React, { useMemo } from 'react';

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function normalize(value, min, max) {
  if (max <= min) return 0;
  return clamp(value, min, max);
}

export function ControlDial({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  formatDisplay,
  size = 'md',
  accent = '#19d9e6',
  onPointerDown,
  onMouseDown,
  onDoubleClick,
  disabled = false,
}) {
  const numericValue = normalize(value, min, max);
  const normalized = (numericValue - min) / (max - min);
  const radius = size === 'sm' ? 20 : 24;
  const viewSize = size === 'sm' ? '3.75rem' : '4.25rem';
  const dialWidth = size === 'sm' ? '4.25rem' : '4.75rem';
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const arcLength = circumference * 0.75;
  const progress = arcLength * normalized;
  const angle = -135 + normalized * 270;
  const display = formatDisplay
    ? formatDisplay(numericValue)
    : (step >= 1 ? Math.round(numericValue).toString() : numericValue.toFixed(2));

  return (
    <div
      className="relative mx-auto grid justify-items-center text-primary min-w-0"
      style={{ width: dialWidth }}
    >
      <div className={`sans ${size === 'sm' ? 'text-[9px]' : 'text-[10px]'} font-medium truncate max-w-full leading-tight text-center text-muted`}>
        {label}
      </div>
      <div className="relative text-muted" style={{ height: viewSize, width: viewSize }}>
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
            stroke={accent}
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
              y2={size === 'sm' ? 30 : 28}
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </g>
        </svg>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numericValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerDown={onPointerDown}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
          aria-label={label}
          className="absolute inset-0 cursor-pointer opacity-0 pointer-events-auto"
        />
      </div>
      <div className={`sans ${size === 'sm' ? 'text-xs' : 'text-sm'} font-semibold leading-none tabular-nums`}>
        {display}
      </div>
    </div>
  );
}
