import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import { FLOW_LOCAL_NODE_TYPE_STEP } from '../domain/flowLocalNodeTypes.js';
import { FlowLocalNodeTypeMenu } from './FlowLocalNodeTypeMenu.jsx';

function stopBubble(event) {
  event.stopPropagation();
}

export function FlowLocalNodeTypePicker({ onSelectType }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  const selectType = (typeId) => {
    setOpen(false);
    onSelectType(typeId);
  };

  return (
    <div ref={rootRef} className="relative mt-2 flex gap-1">
      <button
        type="button"
        onClick={() => selectType(FLOW_LOCAL_NODE_TYPE_STEP)}
        className="sans flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent text-on-accent px-3 py-2 text-xs"
      >
        <Plus size={13} />
        {strings.flow.newFlowNode}
      </button>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={strings.flow.newNodeTypePickerTitle}
        title={strings.flow.newNodeTypePickerTitle}
        onClick={() => setOpen((value) => !value)}
        className="sans shrink-0 flex items-center justify-center rounded-full bg-accent text-on-accent px-2.5 py-2 text-xs"
      >
        <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[60] mt-1 rounded-xl border border-border bg-surface p-2 shadow-xl"
          onPointerDown={stopBubble}
        >
          <p className="sans px-2.5 pb-1 text-[10px] uppercase tracking-wider text-muted">
            {strings.flow.newNodeTypePickerTitle}
          </p>
          <FlowLocalNodeTypeMenu
            ariaLabel={strings.flow.newNodeTypePickerTitle}
            onSelect={selectType}
          />
        </div>
      )}
    </div>
  );
}
