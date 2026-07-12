/* eslint-disable react-refresh/only-export-components */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, ChevronDown, Save, Trash2 } from 'lucide-react';
import {
  deleteBimStylePreset,
  fetchBimStylePresets,
  saveBimStylePreset,
  updateBimStylePreset,
} from '../api/bimApi.js';
import { BIM_STYLE_SETTINGS_SCHEMA_VERSION } from '../bim-core/bimStyleSettings.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Viewport-safe fixed position for the presets popover (unit-tested). */
export function resolveStylePresetPanelStyle({
  anchorRect,
  panelWidth,
  panelHeight,
  margin = 8,
  viewportWidth = 0,
  viewportHeight = 0,
}) {
  if (!anchorRect || panelWidth <= 0 || panelHeight <= 0) return null;

  let left = anchorRect.right - panelWidth;
  let top = anchorRect.bottom + margin;

  if (top + panelHeight > viewportHeight - margin) {
    top = anchorRect.top - panelHeight - margin;
  }

  const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);

  return {
    position: 'fixed',
    left: clamp(left, margin, maxLeft),
    top: clamp(top, margin, maxTop),
    zIndex: 60,
  };
}

export function BimStylePresetsMenu({
  projectId,
  cardId,
  artifactId,
  styleSettings,
  onApplyStyleSettings,
}) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panelStyle, setPanelStyle] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const refreshPresets = useCallback(async () => {
    if (!projectId) return;
    try {
      const next = await fetchBimStylePresets(projectId, { cardId });
      setPresets(next);
    } catch (err) {
      setError(err?.message || 'Could not load style presets.');
    }
  }, [cardId, projectId]);

  useEffect(() => {
    void refreshPresets();
  }, [refreshPresets]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(''), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    setPanelStyle(resolveStylePresetPanelStyle({
      anchorRect: rect,
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }
    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition, presets.length, status, error, presetName, selectedPresetId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      const panel = panelRef.current;
      const button = buttonRef.current;
      if (panel?.contains(event.target) || button?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const handleApplyPreset = useCallback((presetId) => {
    const preset = presets.find((entry) => entry.id === presetId);
    if (!preset?.style) return;
    onApplyStyleSettings?.(preset.style);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setStatus(`Applied "${preset.name}"`);
    setOpen(false);
  }, [onApplyStyleSettings, presets]);

  const handleSavePreset = useCallback(async (overwrite = false) => {
    if (!projectId || !styleSettings) return;
    const trimmedName = presetName.trim() || 'Style preset';
    setBusy(true);
    setError('');
    try {
      let preset;
      if (overwrite && selectedPresetId) {
        preset = await updateBimStylePreset(selectedPresetId, {
          name: trimmedName,
          style: styleSettings,
          schemaVersion: BIM_STYLE_SETTINGS_SCHEMA_VERSION,
          artifactId,
          cardId,
        });
        setStatus(`Updated "${preset.name}"`);
      } else {
        preset = await saveBimStylePreset(projectId, {
          name: trimmedName,
          style: styleSettings,
          schemaVersion: BIM_STYLE_SETTINGS_SCHEMA_VERSION,
          artifactId,
          cardId,
          tags: ['bim-style'],
        });
        setStatus(`Saved "${preset.name}"`);
      }
      setSelectedPresetId(preset.id);
      setPresetName(preset.name);
      await refreshPresets();
    } catch (err) {
      setError(err?.message || 'Could not save style preset.');
    } finally {
      setBusy(false);
    }
  }, [
    artifactId,
    cardId,
    presetName,
    projectId,
    refreshPresets,
    selectedPresetId,
    styleSettings,
  ]);

  const handleDeletePreset = useCallback(async () => {
    if (!selectedPresetId) return;
    setBusy(true);
    setError('');
    try {
      await deleteBimStylePreset(selectedPresetId);
      setSelectedPresetId('');
      setPresetName('');
      setStatus('Preset deleted');
      await refreshPresets();
    } catch (err) {
      setError(err?.message || 'Could not delete style preset.');
    } finally {
      setBusy(false);
    }
  }, [refreshPresets, selectedPresetId]);

  if (!projectId) {
    return null;
  }

  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Style presets"
      className="pointer-events-auto w-72 max-h-[min(70vh,24rem)] overflow-y-auto rounded-md border border-border bg-surface p-2 shadow-lg"
      style={panelStyle ?? { position: 'fixed', left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="sans text-[10px] uppercase tracking-wide text-muted mb-1.5">Style presets</div>
      <label className="sans block text-[10px] text-muted mb-0.5" htmlFor="bim-style-preset-select">
        Load preset
      </label>
      <div className="flex items-center gap-1 mb-2">
        <select
          id="bim-style-preset-select"
          value={selectedPresetId}
          onChange={(event) => {
            const nextId = event.target.value;
            setSelectedPresetId(nextId);
            const preset = presets.find((entry) => entry.id === nextId);
            setPresetName(preset?.name ?? '');
            if (nextId) handleApplyPreset(nextId);
          }}
          className="min-w-0 flex-1 rounded border border-border bg-canvas px-1.5 py-1 text-[11px] text-primary"
        >
          <option value="">Select preset…</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
        <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden />
      </div>
      <label className="sans block text-[10px] text-muted mb-0.5" htmlFor="bim-style-preset-name">
        Name
      </label>
      <input
        id="bim-style-preset-name"
        type="text"
        value={presetName}
        onChange={(event) => setPresetName(event.target.value)}
        placeholder="Preset name"
        className="mb-2 w-full rounded border border-border bg-canvas px-1.5 py-1 text-[11px] text-primary"
      />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSavePreset(false)}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-secondary hover:bg-surface-muted disabled:opacity-40"
        >
          <Save size={12} />
          Save new
        </button>
        <button
          type="button"
          disabled={busy || !selectedPresetId}
          onClick={() => void handleSavePreset(true)}
          className="rounded border border-border px-2 py-1 text-[10px] text-secondary hover:bg-surface-muted disabled:opacity-40"
        >
          Update
        </button>
        <button
          type="button"
          disabled={busy || !selectedPresetId}
          onClick={() => void handleDeletePreset()}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-danger hover:bg-surface-muted disabled:opacity-40"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
      {status ? (
        <div className="sans mt-2 text-[10px] text-success">{status}</div>
      ) : null}
      {error ? (
        <div className="sans mt-2 text-[10px] text-danger">{error}</div>
      ) : null}
      <div className="sans mt-2 text-[9px] text-muted leading-snug">
        Current slider values auto-save to this card and survive refresh when the Canvas API is running.
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Saved style presets"
        aria-label="Saved style presets"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`rounded border border-border p-1 ${open ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
      >
        <Bookmark size={14} strokeWidth={1.7} />
      </button>
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </>
  );
}
