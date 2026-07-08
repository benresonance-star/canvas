import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Pencil, Ruler, Trash2 } from 'lucide-react';
import {
  formatMeasurementDistance,
  formatMeasurementLabel,
  MEASUREMENT_UNIT_OPTIONS,
} from '../utils/measureSnap.js';
import {
  formatRlMeasurementLabel,
  getRlMarkerColor,
  isRlDatumLive,
  RL_DATUM_MARKER_COLOR,
} from '../../bim/bim-core/bimRlMeasure.js';

function colorToCss(hex) {
  const value = Number(hex);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgb(${r}, ${g}, ${b})`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Extra gap between the viewport toolbar and the measurement HUD. */
export const MEASUREMENT_HUD_TOOLBAR_GAP = 5;

/** Viewport-safe fixed position for the measurement HUD below the ruler button. */
export function resolveMeasurementHudStyle({
  anchorRect,
  panelWidth,
  panelHeight,
  margin = 8,
  toolbarGap = MEASUREMENT_HUD_TOOLBAR_GAP,
  viewportWidth = 0,
  viewportHeight = 0,
}) {
  if (!anchorRect || panelWidth <= 0 || panelHeight <= 0) return null;

  let left = anchorRect.left;
  let top = anchorRect.bottom + margin + toolbarGap;

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

function RlColorSwatch({ color }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: colorToCss(color) }}
      aria-hidden="true"
    />
  );
}

function MenuOptionButton({
  active = false,
  disabled = false,
  title,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide transition ${
        active
          ? 'bg-accent text-on-accent'
          : 'text-muted hover:text-primary hover:bg-surface-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function HudSeparator() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border" role="separator" />;
}

function MeasurementToolsHud({
  panelRef,
  panelStyle,
  measureSnapMode,
  measureKind,
  rlDatum,
  enableRlOptions = false,
  editMode = false,
  showEditButton = false,
  hasDeletableItems = false,
  onMeasureSnapModeChange,
  onMeasureKindChange,
  onRlDatumValueChange,
  onActivateMeasure,
  onEditModeChange,
}) {
  const datumLive = isRlDatumLive(rlDatum);
  const isRlMode = measureKind === 'rl' || measureKind === 'datum';

  const activateWithKind = (kind, snapMode = measureSnapMode) => {
    if (editMode) return;
    if (snapMode !== measureSnapMode) onMeasureSnapModeChange?.(snapMode);
    onMeasureKindChange?.(kind);
    onActivateMeasure?.();
  };

  return (
    <div
      ref={panelRef}
      style={panelStyle ?? undefined}
      className={`pointer-events-auto flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-md border border-border bg-surface/95 px-2 py-1.5 shadow-lg backdrop-blur-sm ${
        panelStyle ? '' : 'invisible'
      }`}
      role="menu"
      aria-label="Measurement tools"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <MenuOptionButton
          active={measureKind === 'segment'}
          title="Measure distance between two points"
          disabled={editMode}
          onClick={() => activateWithKind('segment', 'vertex')}
        >
          Distance
        </MenuOptionButton>
        <MenuOptionButton
          active={measureKind === 'polyline'}
          title="Measure polyline path or perimeter"
          disabled={editMode || measureSnapMode === 'edge'}
          onClick={() => activateWithKind('polyline', 'vertex')}
        >
          Polyline
        </MenuOptionButton>
        <MenuOptionButton
          active={!isRlMode && measureSnapMode === 'vertex'}
          title="Snap to vertices"
          disabled={editMode}
          onClick={() => activateWithKind(measureKind === 'polyline' ? 'polyline' : 'segment', 'vertex')}
        >
          Vertex
        </MenuOptionButton>
        <MenuOptionButton
          active={!isRlMode && measureSnapMode === 'edge'}
          title="Snap to edges"
          disabled={editMode}
          onClick={() => {
            if (editMode) return;
            onMeasureSnapModeChange?.('edge');
            onMeasureKindChange?.('segment');
            onActivateMeasure?.();
          }}
        >
          Edge
        </MenuOptionButton>
      </div>

      {enableRlOptions && (
        <>
          <HudSeparator />
          <div className="flex shrink-0 items-center gap-0.5">
            <MenuOptionButton
              active={measureKind === 'rl'}
              title="Place RL height marker"
              disabled={editMode}
              onClick={() => activateWithKind('rl', 'vertex')}
            >
              Height
            </MenuOptionButton>
            <MenuOptionButton
              active={measureKind === 'datum'}
              title="Set or replace datum marker"
              disabled={editMode}
              onClick={() => activateWithKind('datum', 'vertex')}
            >
              Datum
            </MenuOptionButton>
            {datumLive ? (
              <label className={`inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary ${editMode ? 'opacity-50' : ''}`}>
                <span className="text-muted">RL</span>
                <input
                  type="number"
                  step="0.001"
                  value={Number(rlDatum.rlValue ?? 0).toFixed(3)}
                  disabled={editMode}
                  onChange={(event) => onRlDatumValueChange?.(Number(event.target.value))}
                  className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-[10px] text-primary outline-none"
                  aria-label="Datum RL value"
                />
              </label>
            ) : (
              <span className="px-1 text-[10px] text-muted">No datum</span>
            )}
          </div>
        </>
      )}

      {showEditButton && hasDeletableItems && (
        <>
          <HudSeparator />
          <button
            type="button"
            title={editMode ? 'Done editing measurements' : 'Edit measurements'}
            aria-label={editMode ? 'Done editing measurements' : 'Edit measurements'}
            aria-pressed={editMode}
            className={`inline-flex shrink-0 items-center justify-center rounded border px-1.5 py-1 transition ${
              editMode
                ? 'border-accent bg-accent text-on-accent'
                : 'border-border text-muted hover:text-primary hover:bg-surface-muted'
            }`}
            onClick={() => onEditModeChange?.(!editMode)}
          >
            <Pencil size={11} strokeWidth={1.7} />
          </button>
        </>
      )}
    </div>
  );
}

export { MeasurementToolsHud };

export function MeasurementToolbarControls({
  measureModeActive = false,
  measureSnapMode = 'vertex',
  measureKind = 'segment',
  measureUnits = 'cm',
  modelUnits = 'm',
  measurements = [],
  rlDatum = null,
  enableRlOptions = false,
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  onToggleMeasureMode,
  onMeasureSnapModeChange,
  onMeasureKindChange,
  onMeasureUnitsChange,
  onRemoveMeasurement,
  onDeleteRlDatum,
  onRlDatumValueChange,
  editMode: editModeProp,
  onEditModeChange,
  compact = false,
  buttonClassName,
  activeButtonClassName,
}) {
  const [menuOpenInternal, setMenuOpenInternal] = useState(false);
  const [editModeInternal, setEditModeInternal] = useState(false);
  const menuOpen = menuOpenProp ?? menuOpenInternal;
  const setMenuOpen = onMenuOpenChange ?? setMenuOpenInternal;
  const supportsViewportEdit = typeof onEditModeChange === 'function';
  const editMode = supportsViewportEdit ? (editModeProp ?? false) : editModeInternal;
  const setEditMode = supportsViewportEdit ? onEditModeChange : setEditModeInternal;
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);

  const buttonClass = (active = false) => {
    if (buttonClassName) {
      return active && activeButtonClassName
        ? activeButtonClassName
        : buttonClassName(active);
    }
    return `inline-flex items-center justify-center rounded border px-2 py-1 transition ${
      active
        ? 'border-accent bg-accent text-on-accent'
        : 'border-border bg-surface text-secondary hover:text-primary hover:bg-surface-muted'
    }`;
  };
  const iconSize = compact ? 12 : 14;
  const datumLive = isRlDatumLive(rlDatum);
  const hasDeletableItems = measurements.length > 0 || datumLive;

  const activateMeasure = () => {
    if (!measureModeActive) onToggleMeasureMode?.();
  };

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    setPanelStyle(resolveMeasurementHudStyle({
      anchorRect: rect,
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
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
  }, [
    menuOpen,
    updatePanelPosition,
    measureKind,
    measureSnapMode,
    enableRlOptions,
    rlDatum,
    measurements,
    measureModeActive,
    editMode,
    hasDeletableItems,
  ]);

  useEffect(() => {
    if (!menuOpen) {
      setEditMode(false);
    }
  }, [menuOpen, setEditMode]);

  useEffect(() => {
    if (!hasDeletableItems) {
      setEditMode(false);
    }
  }, [hasDeletableItems, setEditMode]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      const panel = panelRef.current;
      const button = buttonRef.current;
      if (panel?.contains(event.target) || button?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, setMenuOpen]);

  return (
    <div className="inline-flex items-center gap-1">
      <button
        ref={buttonRef}
        type="button"
        title="Measure"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={buttonClass(measureModeActive || menuOpen)}
        onClick={() => {
          setMenuOpen((open) => {
            const next = !open;
            if (next) activateMeasure();
            return next;
          });
        }}
      >
        <Ruler size={iconSize} strokeWidth={1.7} />
      </button>
      <label className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary">
        <span className="uppercase tracking-wide text-muted">Unit</span>
        <select
          value={measureUnits}
          onChange={(event) => onMeasureUnitsChange?.(event.target.value)}
          className="three-d-measure-unit-select outline-none cursor-pointer"
          aria-label="Measurement unit"
        >
          {MEASUREMENT_UNIT_OPTIONS.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </label>
      {menuOpen && typeof document !== 'undefined' && createPortal(
        <MeasurementToolsHud
          panelRef={panelRef}
          panelStyle={panelStyle}
          measureSnapMode={measureSnapMode}
          measureKind={measureKind}
          rlDatum={rlDatum}
          enableRlOptions={enableRlOptions}
          editMode={editMode}
          showEditButton={supportsViewportEdit}
          hasDeletableItems={hasDeletableItems}
          onMeasureSnapModeChange={onMeasureSnapModeChange}
          onMeasureKindChange={onMeasureKindChange}
          onRlDatumValueChange={onRlDatumValueChange}
          onActivateMeasure={activateMeasure}
          onEditModeChange={setEditMode}
        />,
        document.body,
      )}
    </div>
  );
}

export function MeasurementsListPanel({
  measurements,
  units = 'cm',
  modelUnits = 'cm',
  measurementsVisible = true,
  rlDatum = null,
  onMeasurementsVisibleChange,
  onRemoveMeasurement,
  onRlDatumValueChange,
  onDeleteRlDatum,
  onReplaceRlDatum,
  onRlMeasurementDatumToggle,
  className = 'sans absolute bottom-3 left-3 z-20 max-w-sm rounded border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm',
}) {
  const datumLive = isRlDatumLive(rlDatum);
  const hasEntries = measurements.length > 0 || datumLive;
  if (!hasEntries) return null;

  const distanceMeasurements = measurements.filter((entry) => entry.kind !== 'rl');
  const rlMeasurements = measurements.filter((entry) => entry.kind === 'rl');

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">Measurements</div>
        <button
          type="button"
          title={measurementsVisible ? 'Hide measurements on model' : 'Show measurements on model'}
          aria-label={measurementsVisible ? 'Hide measurements on model' : 'Show measurements on model'}
          aria-pressed={measurementsVisible}
          className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 transition ${
            measurementsVisible
              ? 'border-accent/50 text-accent hover:bg-accent/10'
              : 'border-border text-muted hover:text-primary hover:bg-surface-muted'
          }`}
          onClick={() => onMeasurementsVisibleChange?.(!measurementsVisible)}
        >
          {measurementsVisible ? <Eye size={12} strokeWidth={1.7} /> : <EyeOff size={12} strokeWidth={1.7} />}
        </button>
      </div>
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {datumLive && (
          <div className="flex items-center justify-between gap-2 rounded border border-accent/30 bg-accent/5 px-2 py-1 text-xs text-secondary">
            <div className="flex items-center gap-2">
              <RlColorSwatch color={RL_DATUM_MARKER_COLOR} />
              <span>Datum · RL {Number(rlDatum.rlValue ?? 0).toFixed(3)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Replace datum"
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:text-primary"
                onClick={() => onReplaceRlDatum?.()}
              >
                Replace
              </button>
              <button
                type="button"
                title="Delete datum"
                className="inline-flex items-center justify-center rounded border border-border px-1.5 py-0.5 text-muted hover:text-warning hover:border-warning transition"
                onClick={() => onDeleteRlDatum?.()}
              >
                <Trash2 size={12} strokeWidth={1.7} />
              </button>
            </div>
          </div>
        )}
        {rlMeasurements.map((measurement, index) => {
          const measuredFromDatum = measurement.measuredFromDatum === true && datumLive;
          const markerColor = getRlMarkerColor(measuredFromDatum, datumLive);
          return (
            <div key={measurement.id} className="flex items-center justify-between gap-2 text-xs text-secondary">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <RlColorSwatch color={markerColor} />
                  <span>
                    {index + 1}. {formatRlMeasurementLabel(measurement, units, modelUnits, rlDatum)}
                  </span>
                </div>
                {datumLive && (
                  <label className="inline-flex items-center gap-1 pl-4 text-[10px] text-muted">
                    <input
                      type="checkbox"
                      checked={measurement.measuredFromDatum === true}
                      onChange={(event) => onRlMeasurementDatumToggle?.(measurement.id, event.target.checked)}
                    />
                    <span>Measured from user datum</span>
                  </label>
                )}
              </div>
              <button
                type="button"
                title="Delete RL marker"
                className="inline-flex items-center justify-center rounded border border-border px-1.5 py-0.5 text-muted hover:text-warning hover:border-warning transition"
                onClick={() => onRemoveMeasurement?.(measurement.id)}
              >
                <Trash2 size={12} strokeWidth={1.7} />
              </button>
            </div>
          );
        })}
        {distanceMeasurements.map((measurement, index) => (
          <div key={measurement.id} className="flex items-center justify-between gap-2 text-xs text-secondary">
            <span>
              {index + 1}. {formatMeasurementLabel(measurement, units, modelUnits)}
            </span>
            <button
              type="button"
              title="Delete measurement"
              className="inline-flex items-center justify-center rounded border border-border px-1.5 py-0.5 text-muted hover:text-warning hover:border-warning transition"
              onClick={() => onRemoveMeasurement?.(measurement.id)}
            >
              <Trash2 size={12} strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
