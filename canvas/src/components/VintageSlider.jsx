import React from 'react';

/**
 * Hardware-style range slider (recessed track + block fader cap).
 * Use for visible sliders only — not hidden dial overlays.
 */
export function VintageSlider({
  className = '',
  min = 0,
  max = 1,
  value = 0,
  style,
  ...props
}) {
  return (
    <div className="vintage-slider-wrap" style={style}>
      <div className="vintage-slider-track" aria-hidden="true" />
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        className={['vintage-slider', className].filter(Boolean).join(' ')}
        {...props}
      />
    </div>
  );
}
