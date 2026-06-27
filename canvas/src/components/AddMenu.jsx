import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { strings } from '../content/strings.js';
import { buildAddMenuItems } from './addMenuItems.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = target.tagName;
  if (typeof tag !== 'string') return false;
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target.isContentEditable);
}

/**
 * @param {'button' | 'context'} props.variant
 * @param {{ left: number, top: number, right: number, bottom: number } | { clientX: number, clientY: number } | null} props.anchor
 */
export function AddMenu({
  open,
  variant = 'button',
  anchor = null,
  onClose,
  onSelect,
  onOpenButton,
  syncLock,
  activeProjectId,
  folderLinked,
  buttonRef: externalButtonRef,
}) {
  const internalButtonRef = useRef(null);
  const buttonRef = externalButtonRef ?? internalButtonRef;
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);
  const items = buildAddMenuItems({ syncLock, activeProjectId, folderLinked });

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPanelStyle(null);
      return;
    }
    const panel = panelRef.current;
    const margin = 8;
    const panelWidth = panel?.offsetWidth || 220;
    const panelHeight = panel?.offsetHeight || 280;
    const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);

    if (variant === 'button' && anchor.left != null) {
      const left = clamp(anchor.left, margin, maxLeft);
      const top = clamp(anchor.top - panelHeight - margin, margin, maxTop);
      setPanelStyle({ position: 'fixed', left, top, zIndex: 60 });
      return;
    }

    if (variant === 'context' && anchor.clientX != null) {
      let left = anchor.clientX;
      let top = anchor.clientY;
      if (left + panelWidth > window.innerWidth - margin) {
        left = window.innerWidth - panelWidth - margin;
      }
      if (top + panelHeight > window.innerHeight - margin) {
        top = window.innerHeight - panelHeight - margin;
      }
      setPanelStyle({
        position: 'fixed',
        left: clamp(left, margin, maxLeft),
        top: clamp(top, margin, maxTop),
        zIndex: 60,
      });
    }
  }, [open, anchor, variant]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    const onClick = (e) => {
      const panel = panelRef.current;
      const button = buttonRef.current;
      if (panel?.contains(e.target) || button?.contains(e.target)) return;
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose, buttonRef]);

  const handleItemClick = (item) => {
    if (item.disabled) return;
    onSelect?.(item.id);
    onClose?.();
  };

  const handleButtonClick = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    onOpenButton?.({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
  };

  const menuPanel = open && panelStyle ? (
    <div
      ref={panelRef}
      role="menu"
      aria-label={strings.addMenu.title}
      className="w-56 max-h-80 overflow-y-auto bg-surface border border-border rounded-lg shadow-2xl p-1"
      style={panelStyle}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabled ? item.disabledReason : undefined}
            onClick={() => handleItemClick(item)}
            className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded text-xs transition ${
              item.disabled
                ? 'opacity-50 cursor-not-allowed text-muted'
                : 'text-primary hover:bg-surface-muted'
            }`}
          >
            <Icon size={14} strokeWidth={1.8} className="shrink-0 text-muted" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  if (variant === 'context') {
    return menuPanel;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={strings.addMenu.title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleButtonClick}
        className="sans flex items-center gap-2 bg-surface border border-border hover:bg-surface-muted text-primary text-xs px-4 py-2.5 rounded-full transition shadow-lg"
      >
        <Plus size={13} strokeWidth={1.8} />
        {strings.addMenu.title}
      </button>
      {menuPanel}
    </>
  );
}

export function shouldOpenCanvasAddMenu(event) {
  if (event.defaultPrevented) return false;
  if (isEditableTarget(event.target)) return false;
  return true;
}
