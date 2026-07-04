import React, { useEffect, useMemo, useRef } from 'react';

export function BimElementTable({
  elements,
  selectedElementId,
  search,
  ifcClassFilter,
  title = 'Elements',
  onSearchChange,
  onIfcClassFilterChange,
  onSelectElement,
}) {
  const rowRefs = useRef(new Map());
  const classes = useMemo(
    () => [...new Set(elements.map((element) => element.ifcClass).filter(Boolean))].sort(),
    [elements],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return elements.filter((element) => {
      if (ifcClassFilter && element.ifcClass !== ifcClassFilter) return false;
      if (!q) return true;
      return [element.name, element.ifcClass, element.ifcGlobalId, element.typeName, element.storeyId]
        .some((value) => String(value ?? '').toLowerCase().includes(q));
    });
  }, [elements, ifcClassFilter, search]);

  useEffect(() => {
    if (!selectedElementId) return;
    const row = rowRefs.current.get(selectedElementId);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.focus({ preventScroll: true });
  }, [selectedElementId, filtered]);

  return (
    <div className="h-full min-h-0 flex flex-col border-r border-border bg-surface">
      <div className="shrink-0 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted">
        {title} · {filtered.length}
      </div>
      <div className="shrink-0 p-2 border-b border-border flex gap-2">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search elements"
          className="min-w-0 flex-1 rounded border border-border bg-preview-bg px-2 py-1 text-xs text-primary outline-none"
        />
        <select
          value={ifcClassFilter}
          onChange={(event) => onIfcClassFilterChange(event.target.value)}
          className="w-32 rounded border border-border bg-preview-bg px-2 py-1 text-xs text-secondary outline-none"
          aria-label="IFC class filter"
        >
          <option value="">All classes</option>
          {classes.map((ifcClass) => (
            <option key={ifcClass} value={ifcClass}>{ifcClass}</option>
          ))}
        </select>
      </div>
      <div className="shrink-0 grid grid-cols-[1.1fr_.75fr_1.1fr_.8fr_.9fr] gap-2 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted">
        <span>Name</span>
        <span>Class</span>
        <span>GlobalId</span>
        <span>Storey</span>
        <span>Type</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {filtered.map((element) => (
          <button
            key={element.id}
            ref={(node) => {
              if (node) rowRefs.current.set(element.id, node);
              else rowRefs.current.delete(element.id);
            }}
            type="button"
            aria-current={selectedElementId === element.id ? 'true' : undefined}
            onClick={() => onSelectElement(element.id)}
            className={`w-full grid grid-cols-[1.1fr_.75fr_1.1fr_.8fr_.9fr] gap-2 px-2 py-1.5 text-left text-xs border-b border-border/70 ${
              selectedElementId === element.id
                ? 'bg-accent text-on-accent'
                : 'text-secondary hover:bg-surface-muted'
            }`}
          >
            <span className="truncate">{element.name || 'Unnamed'}</span>
            <span className="truncate">{element.ifcClass}</span>
            <span className="truncate font-mono text-[10px]">{element.ifcGlobalId}</span>
            <span className="truncate">{element.storeyId || '-'}</span>
            <span className="truncate">{element.typeName || '-'}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="p-4 text-xs text-muted text-center">No elements match this filter.</div>
        )}
      </div>
    </div>
  );
}
