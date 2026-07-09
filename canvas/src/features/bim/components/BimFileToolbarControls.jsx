import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, File, FilePlus2, FileText, Trash2 } from 'lucide-react';
import {
  MEASUREMENT_HUD_TOOLBAR_GAP,
  resolveMeasurementHudStyle,
} from '../../threeDArtifact/components/MeasurementUi.jsx';

export function BimFileManagerPanel({
  panelRef,
  panelStyle,
  session,
  prepared,
  importBusy,
  importStatus,
  onImportFiles,
  onSetActiveModel,
  onToggleModelVisibility,
  onRemoveModel,
  inputRef,
}) {
  const modelRefs = session?.modelRefs ?? [];
  const activeModel = modelRefs.find((ref) => ref.modelId === session?.activeModelId) ?? null;
  const visibleCount = modelRefs.filter((ref) => session?.visibilityByModelId?.[ref.modelId] !== false).length;
  const loadedCount = modelRefs.filter((ref) => ref.status !== 'removed').length;

  return (
    <div
      ref={panelRef}
      style={panelStyle ?? undefined}
      className={`pointer-events-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-md border border-border bg-surface/95 shadow-lg backdrop-blur-sm ${
        panelStyle ? '' : 'invisible'
      }`}
      role="menu"
      aria-label="IFC file manager"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <button
          type="button"
          title="Import IFC files"
          onClick={() => inputRef?.current?.click()}
          disabled={importBusy}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:opacity-50"
        >
          <FilePlus2 size={13} strokeWidth={1.7} />
          Import
        </button>
        <div className="min-w-0 text-right text-[10px] text-muted">
          <div className="truncate">
            ACTIVE FILE: {activeModel?.label ?? prepared?.metadata?.filename ?? 'None'}
          </div>
          <div>{loadedCount} files loaded · {visibleCount} visible</div>
        </div>
      </div>
      {importStatus ? (
        <div className="border-b border-border px-2 py-1 text-[10px] text-muted">{importStatus}</div>
      ) : null}
      {modelRefs.length > 0 ? (
        <div className="max-h-44 overflow-auto p-1">
          {modelRefs.map((ref) => {
            const active = ref.modelId === session?.activeModelId;
            const visible = session?.visibilityByModelId?.[ref.modelId] !== false;
            return (
              <div
                key={ref.modelId}
                className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${active ? 'bg-accent/10 text-primary' : 'text-secondary'}`}
              >
                <FileText size={13} strokeWidth={1.6} className="shrink-0 text-muted" />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSetActiveModel(ref.modelId)}
                >
                  <div className="truncate">{ref.label}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    {ref.status}
                    {ref.sourceStatus && ref.sourceStatus !== 'unknown' ? ` · ${ref.sourceStatus}` : ''}
                  </div>
                </button>
                <button
                  type="button"
                  title={visible ? 'Hide file' : 'Show file'}
                  onClick={() => onToggleModelVisibility(ref.modelId)}
                  className="rounded p-1 text-muted hover:bg-surface-muted hover:text-secondary"
                >
                  {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  type="button"
                  title="Remove file from viewer"
                  onClick={() => onRemoveModel(ref.modelId)}
                  className="rounded p-1 text-muted hover:bg-surface-muted hover:text-warning"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-2 text-[11px] text-muted">
          Import one or more IFC files to start this federated viewer session.
        </div>
      )}
    </div>
  );
}

export default function BimFileToolbarControls({
  menuOpen: menuOpenProp,
  onMenuOpenChange,
  session,
  prepared,
  importBusy = false,
  importStatus = '',
  onImportFiles = () => {},
  onSetActiveModel = () => {},
  onToggleModelVisibility = () => {},
  onRemoveModel = () => {},
  compact = false,
  buttonClassName,
  activeButtonClassName,
}) {
  const [menuOpenInternal, setMenuOpenInternal] = useState(false);
  const menuOpen = menuOpenProp ?? menuOpenInternal;
  const setMenuOpen = onMenuOpenChange ?? setMenuOpenInternal;
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);

  const modelRefs = session?.modelRefs ?? [];
  const loadedCount = modelRefs.filter((ref) => ref.status !== 'removed').length;

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
  }, [menuOpen, updatePanelPosition, importStatus, loadedCount, session?.activeModelId]);

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
        title="IFC files"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={buttonClass(menuOpen)}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <File size={iconSize} strokeWidth={1.7} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".ifc,application/x-step"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length) void onImportFiles(files);
        }}
      />
      {menuOpen && typeof document !== 'undefined' && createPortal(
        <BimFileManagerPanel
          panelRef={panelRef}
          panelStyle={panelStyle}
          session={session}
          prepared={prepared}
          importBusy={importBusy}
          importStatus={importStatus}
          onImportFiles={onImportFiles}
          onSetActiveModel={onSetActiveModel}
          onToggleModelVisibility={onToggleModelVisibility}
          onRemoveModel={onRemoveModel}
          inputRef={inputRef}
        />,
        document.body,
      )}
    </>
  );
}
