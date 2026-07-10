import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlipHorizontal2, Wrench } from 'lucide-react';
import { resolveMeasurementHudStyle } from '../../threeDArtifact/components/MeasurementUi.jsx';

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

export function BimGeometryRepairHud({
  panelRef,
  panelStyle,
  selectedElement = null,
  geometryEditMode = false,
  selectedShellIndex = null,
  shellCount = 0,
  shellLoading = false,
  flippedShellIndexes = [],
  onGeometryEditModeChange,
  onSelectShell,
  onFlipNormals,
}) {
  const hasSelection = Boolean(selectedElement);
  const canFlip = geometryEditMode && hasSelection && selectedShellIndex != null;
  const flippedSet = new Set(flippedShellIndexes);

  return (
    <div
      ref={panelRef}
      style={panelStyle ?? undefined}
      className={`pointer-events-auto flex w-max max-w-[min(calc(100vw-1.5rem),28rem)] flex-col gap-2 rounded-md border border-border bg-surface/95 px-2.5 py-2 shadow-lg backdrop-blur-sm ${
        panelStyle ? '' : 'invisible'
      }`}
      role="menu"
      aria-label="Geometry repair tools"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <Wrench size={12} strokeWidth={1.8} aria-hidden />
          <span className="text-secondary">Geometry repair</span>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-secondary">
          <input
            type="checkbox"
            checked={geometryEditMode}
            disabled={!hasSelection}
            onChange={(event) => onGeometryEditModeChange?.(event.target.checked)}
            className="accent-accent disabled:cursor-not-allowed"
            aria-label={geometryEditMode ? 'Disable edit geometry' : 'Enable edit geometry'}
          />
          <span>Edit geometry</span>
        </label>
      </div>

      <div className="rounded border border-border-subtle bg-surface-muted/40 px-2 py-1.5 text-[11px] text-secondary">
        {hasSelection ? (
          <>
            <div className="truncate font-medium text-primary">{selectedElement.name ?? 'Unnamed element'}</div>
            <div className="truncate text-muted">{selectedElement.ifcClass ?? 'IfcElement'}</div>
          </>
        ) : (
          <div className="text-muted">Select an element in the viewport to repair geometry.</div>
        )}
      </div>

      {geometryEditMode && hasSelection ? (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Submeshes</div>
          {shellLoading ? (
            <div className="text-[11px] text-muted">Loading submeshes…</div>
          ) : shellCount > 0 ? (
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {Array.from({ length: shellCount }, (_, index) => (
                <button
                  key={`shell-${index}`}
                  type="button"
                  title={`Select shell ${index + 1}${flippedSet.has(index) ? ' (flipped)' : ''}`}
                  className={`rounded border px-2 py-0.5 text-[10px] transition ${
                    selectedShellIndex === index
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border text-secondary hover:border-accent/60 hover:text-primary'
                  }`}
                  onClick={() => onSelectShell?.(index)}
                >
                  Shell {index + 1}
                  {flippedSet.has(index) ? ' · flipped' : ''}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-muted">
              No submeshes were returned for this element.
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <MenuOptionButton
          active={false}
          disabled={!canFlip}
          title={canFlip ? 'Flip normals for the selected submesh' : 'Select a submesh first'}
          onClick={() => onFlipNormals?.()}
        >
          <span className="inline-flex items-center gap-1">
            <FlipHorizontal2 size={11} strokeWidth={1.8} aria-hidden />
            Flip normals
          </span>
        </MenuOptionButton>
      </div>
    </div>
  );
}

export function BimGeometryRepairToolbarControls({
  selectedElement = null,
  geometryEditMode = false,
  selectedShellIndex = null,
  shellCount = 0,
  shellLoading = false,
  flippedShellIndexes = [],
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  onGeometryEditModeChange,
  onSelectShell,
  onFlipNormals,
  compact = false,
  buttonClassName,
  activeButtonClassName,
}) {
  const [menuOpenInternal, setMenuOpenInternal] = useState(false);
  const menuOpen = menuOpenProp ?? menuOpenInternal;
  const setMenuOpen = onMenuOpenChange ?? setMenuOpenInternal;
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
  const iconSize = compact ? 14 : 16;

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
    selectedElement,
    geometryEditMode,
    selectedShellIndex,
    shellCount,
    shellLoading,
    flippedShellIndexes,
  ]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (geometryEditMode) return;
      const panel = panelRef.current;
      const button = buttonRef.current;
      if (panel?.contains(event.target) || button?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[data-bim-viewport-canvas]')) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !geometryEditMode) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [geometryEditMode, menuOpen, setMenuOpen]);

  return (
    <div className="inline-flex items-center gap-1">
      <button
        ref={buttonRef}
        type="button"
        title={menuOpen ? 'Hide geometry repair' : 'Geometry repair'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-pressed={geometryEditMode}
        className={buttonClass(menuOpen || geometryEditMode)}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Wrench size={iconSize} strokeWidth={1.7} />
      </button>
      {menuOpen && typeof document !== 'undefined' && createPortal(
        <BimGeometryRepairHud
          panelRef={panelRef}
          panelStyle={panelStyle}
          selectedElement={selectedElement}
          geometryEditMode={geometryEditMode}
          selectedShellIndex={selectedShellIndex}
          shellCount={shellCount}
          shellLoading={shellLoading}
          flippedShellIndexes={flippedShellIndexes}
          onGeometryEditModeChange={onGeometryEditModeChange}
          onSelectShell={onSelectShell}
          onFlipNormals={onFlipNormals}
        />,
        document.body,
      )}
    </div>
  );
}
