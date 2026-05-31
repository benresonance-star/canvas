import React, { useEffect, useRef, useState } from 'react';
import { Palette, Star, X } from 'lucide-react';
import { strings } from '../content/strings.js';
import {
  AUDIO_SKIN_PRESETS,
  addFavoriteColor,
  loadAudioSkinPrefs,
  normalizeAudioSkinColor,
  removeFavoriteColor,
  saveAudioSkinPrefs,
  setDefaultAudioSkinColor,
} from '../lib/audioSkin.js';

function Swatch({
  color,
  selected,
  isFavorite,
  showStar,
  onClick,
  onToggleFavorite,
  onHover,
  title,
}) {
  return (
    <div
      className="relative"
      onMouseEnter={() => onHover?.(color)}
    >
      <button
        type="button"
        title={title || color}
        aria-label={title || color}
        className={`w-7 h-7 rounded-md border-2 transition shrink-0 ${
          selected ? 'border-accent ring-1 ring-accent/40' : 'border-border hover:border-accent/50'
        }`}
        style={{ backgroundColor: color }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(color);
        }}
      />
      {onToggleFavorite && showStar && (
        <button
          type="button"
          className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center border border-border bg-surface ${
            isFavorite ? 'text-accent' : 'text-muted'
          }`}
          title={
            isFavorite ? strings.audioSkin.removeFavorite : strings.audioSkin.addFavorite
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(color);
          }}
        >
          <Star size={8} className={isFavorite ? 'fill-current' : ''} />
        </button>
      )}
    </div>
  );
}

export function AudioSkinPicker({
  currentColor,
  onApply,
  onClose,
}) {
  const panelRef = useRef(null);
  const [prefs, setPrefs] = useState(() => loadAudioSkinPrefs());
  const [draft, setDraft] = useState(() => normalizeAudioSkinColor(currentColor) || '');
  const [hoveredColor, setHoveredColor] = useState(null);

  useEffect(() => {
    setDraft(normalizeAudioSkinColor(currentColor) || '');
  }, [currentColor]);

  useEffect(() => {
    const onDocDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [onClose]);

  const applyColor = (color) => {
    const c = normalizeAudioSkinColor(color);
    if (!c) return;
    setDraft(c);
    onApply(c);
  };

  const toggleFavorite = (color) => {
    const c = normalizeAudioSkinColor(color);
    if (!c) return;
    const next = prefs.favorites.includes(c)
      ? removeFavoriteColor(c)
      : addFavoriteColor(c);
    setPrefs(next);
  };

  const isDefault = draft && prefs.defaultColor === draft;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-[60] w-56 rounded-lg border border-border bg-surface shadow-xl p-3 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="sans text-[10px] uppercase tracking-wider text-muted">
          {strings.audioSkin.title}
        </span>
        <button
          type="button"
          className="p-0.5 text-muted hover:text-primary"
          aria-label={strings.audioSkin.close}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
        >
          <X size={14} />
        </button>
      </div>

      <div onMouseLeave={() => setHoveredColor(null)}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {AUDIO_SKIN_PRESETS.map((c) => (
            <Swatch
              key={c}
              color={c}
              selected={draft === c}
              isFavorite={prefs.favorites.includes(c)}
              showStar={hoveredColor === c}
              onHover={setHoveredColor}
              onClick={applyColor}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>

        {prefs.favorites.length > 0 && (
          <div className="mb-3">
            <div className="sans text-[9px] uppercase tracking-wider text-muted mb-1.5">
              {strings.audioSkin.favorites}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {prefs.favorites.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  selected={draft === c}
                  isFavorite
                  showStar={hoveredColor === c}
                  onHover={setHoveredColor}
                  onClick={applyColor}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 mb-3">
        <span className="sans text-[10px] text-muted shrink-0">{strings.audioSkin.custom}</span>
        <input
          type="color"
          value={draft || '#1a1a2e'}
          className="w-8 h-7 rounded border border-border cursor-pointer bg-transparent p-0"
          onChange={(e) => applyColor(e.target.value)}
        />
        <span className="sans text-[9px] text-muted font-mono truncate">{draft}</span>
      </label>

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-2">
        <button
          type="button"
          className="sans text-[10px] text-left text-accent hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            if (draft) {
              const next = addFavoriteColor(draft);
              setPrefs(next);
            }
          }}
        >
          {strings.audioSkin.addCurrentToFavorites}
        </button>
        <button
          type="button"
          className={`sans text-[10px] text-left hover:underline ${
            isDefault ? 'text-accent' : 'text-secondary'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (!draft) return;
            const next = isDefault
              ? saveAudioSkinPrefs({ ...prefs, defaultColor: null })
              : setDefaultAudioSkinColor(draft);
            setPrefs(next);
          }}
        >
          {isDefault ? strings.audioSkin.clearDefault : strings.audioSkin.setDefault}
        </button>
      </div>
    </div>
  );
}

export function AudioSkinTrigger({ currentColor, onApply, compact = false }) {
  const [open, setOpen] = useState(false);
  const resolved = normalizeAudioSkinColor(currentColor);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={strings.audioSkin.pickColor}
        aria-label={strings.audioSkin.pickColor}
        aria-expanded={open}
        className={`p-1 rounded transition pointer-events-auto border ${
          open ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-accent'
        }`}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Palette size={compact ? 12 : 13} strokeWidth={1.5} />
        {resolved && (
          <span
            className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-surface"
            style={{ backgroundColor: resolved }}
          />
        )}
      </button>
      {open && (
        <AudioSkinPicker
          currentColor={resolved}
          onApply={(c) => {
            onApply(c);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
