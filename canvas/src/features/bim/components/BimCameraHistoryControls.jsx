import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, History } from 'lucide-react';
import { resolveMeasurementHudStyle, MEASUREMENT_HUD_TOOLBAR_GAP } from '../../threeDArtifact/components/MeasurementUi.jsx';

function HudOptionButton({
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
        disabled
          ? 'cursor-not-allowed text-muted opacity-50'
          : 'text-muted hover:bg-surface-muted hover:text-primary'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function BimCameraHistoryHud({
  panelRef,
  panelStyle,
  pastCount,
  futureCount,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}) {
  return (
    <div
      ref={panelRef}
      style={panelStyle ?? undefined}
      className={`pointer-events-auto flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-md border border-border bg-surface/95 px-2 py-1.5 shadow-lg backdrop-blur-sm ${
        panelStyle ? '' : 'invisible'
      }`}
      role="menu"
      aria-label="Camera history"
      onClick={(event) => event.stopPropagation()}
    >
      <HudOptionButton
        disabled={!canGoBack}
        title="Go back to previous camera view"
        onClick={onGoBack}
      >
        <span className="inline-flex items-center gap-1">
          <ArrowLeft size={11} strokeWidth={1.7} />
          Go back
        </span>
      </HudOptionButton>
      <div className="mx-0.5 h-4 w-px shrink-0 bg-border" role="separator" />
      <HudOptionButton
        disabled={!canGoForward}
        title="Go forward to next camera view"
        onClick={onGoForward}
      >
        <span className="inline-flex items-center gap-1">
          Go forward
          <ArrowRight size={11} strokeWidth={1.7} />
        </span>
      </HudOptionButton>
      {pastCount > 0 ? (
        <>
          <div className="mx-0.5 h-4 w-px shrink-0 bg-border" role="separator" />
          <span className="px-1 text-[10px] text-muted">
            {pastCount} step{pastCount === 1 ? '' : 's'} back
          </span>
        </>
      ) : null}
      {futureCount > 0 ? (
        <span className="px-1 text-[10px] text-muted">
          · {futureCount} forward
        </span>
      ) : null}
    </div>
  );
}

export default function BimCameraHistoryControls({
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  canGoBack = false,
  canGoForward = false,
  pastCount = 0,
  futureCount = 0,
  onGoBack,
  onGoForward,
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

  const iconSize = compact ? 14 : 14;

  const updatePanelPosition = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    setPanelStyle(resolveMeasurementHudStyle({
      anchorRect: rect,
      panelWidth: panel.offsetWidth,
      panelHeight: panel.offsetHeight,
      toolbarGap: MEASUREMENT_HUD_TOOLBAR_GAP,
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
  }, [menuOpen, updatePanelPosition, canGoBack, canGoForward, pastCount, futureCount]);

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
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Camera history"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={buttonClass(menuOpen)}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <History size={iconSize} strokeWidth={1.7} />
      </button>
      {menuOpen && typeof document !== 'undefined' && createPortal(
        <BimCameraHistoryHud
          panelRef={panelRef}
          panelStyle={panelStyle}
          pastCount={pastCount}
          futureCount={futureCount}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
        />,
        document.body,
      )}
    </>
  );
}
