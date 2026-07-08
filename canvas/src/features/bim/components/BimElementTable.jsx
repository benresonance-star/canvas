import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import {
  BIM_COLOR_BY_DEFAULT_PROPERTY,
  resolveColorByGroupKey,
  resolveElementColorByPaletteColor,
} from '../bim-core/bimColorBy.js';
import { buildPropertiesByElement } from '../bim-core/bimSectioning.js';
import {
  addTableColumn,
  buildTableColumnCatalog,
  removeTableColumn,
  reorderTableColumns,
  resizeTableColumns,
  resolveTableColumnValue,
  searchableTableColumnValues,
  sortTableElements,
  tableColumnGridTemplate,
  tableColumnLabel,
  updateTableColumnField,
} from '../bim-core/bimTableColumns.js';

const COLOR_BY_SWATCH_GRID_COLUMN = '1.25rem';

function ElementColorSwatch({ color, label, selected = false }) {
  return (
    <span
      className="flex items-center justify-center px-1 py-1.5"
      title={label}
      aria-label={label ? `Color group: ${label}` : undefined}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-sm border ${
          selected ? 'border-on-accent/50' : 'border-border/70'
        }`}
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

function groupCatalog(catalog) {
  const byGroup = new Map();
  catalog.forEach((entry) => {
    if (!byGroup.has(entry.group)) byGroup.set(entry.group, []);
    byGroup.get(entry.group).push(entry);
  });
  return [...byGroup.entries()];
}

function ColumnListSelect({ value, options, onChange, className, ariaLabel }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const selectedLabel = selected?.label ?? 'Select column';

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className ?? ''}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-1 rounded border border-border bg-surface px-1 py-0.5 text-left text-[11px] text-secondary outline-none hover:bg-surface-muted"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-auto rounded border border-border bg-surface shadow-lg"
        >
          {options.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-1 text-left text-[11px] ${
                  isSelected
                    ? 'bg-accent text-on-accent'
                    : 'text-secondary hover:bg-surface-muted'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColumnSortMenu({ columnId, tableSort, onSelect, onClose, boundaryRef }) {
  const menuRef = useRef(null);
  const [alignRight, setAlignRight] = useState(false);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const boundary = boundaryRef?.current;
    if (!menu || !boundary) return;
    const menuRect = menu.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    setAlignRight(menuRect.right > boundaryRect.right - 4);
  }, [boundaryRef, columnId]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const isActiveColumn = tableSort?.columnId === columnId;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Column sort"
      className={`absolute top-full z-50 mt-1 min-w-[9rem] rounded border border-border bg-surface py-1 shadow-lg ${
        alignRight ? 'right-0' : 'left-0'
      }`}
    >
      {[
        { direction: 'asc', label: 'Ascending' },
        { direction: 'desc', label: 'Descending' },
        { direction: 'default', label: 'Default' },
      ].map((option) => {
        const selected = option.direction === 'default'
          ? !isActiveColumn
          : isActiveColumn && tableSort?.direction === option.direction;
        return (
          <button
            key={option.direction}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => onSelect(option.direction)}
            className={`block w-full px-3 py-1.5 text-left text-[11px] ${
              selected
                ? 'bg-accent text-on-accent'
                : 'text-secondary hover:bg-surface-muted'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ColumnFieldSelect({
  value,
  catalog,
  onChange,
  className,
  ariaLabel,
  variant = 'control',
  sortDirection = null,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const selectedLabel = tableColumnLabel(value, catalog);
  const isHeader = variant === 'header';

  const toggleOpen = () => {
    setOpen((current) => {
      if (!current) {
        setCollapsedGroups(new Set(groups.map(([group]) => group)));
      }
      return !current;
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const toggleGroup = (group) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const selectField = (field) => {
    onChange(field);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className ?? ''}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggleOpen}
        onPointerDown={(event) => event.stopPropagation()}
        className={
          isHeader
            ? 'flex min-w-0 flex-1 items-center gap-0.5 truncate text-left text-[10px] uppercase tracking-wider text-muted outline-none hover:text-primary'
            : 'flex w-full items-center justify-between gap-1 rounded border border-border bg-surface px-1 py-0.5 text-left text-[11px] text-secondary outline-none hover:bg-surface-muted'
        }
      >
        <span className="truncate">{selectedLabel}</span>
        {isHeader && sortDirection === 'asc' && <span className="shrink-0 text-[9px]">↑</span>}
        {isHeader && sortDirection === 'desc' && <span className="shrink-0 text-[9px]">↓</span>}
        {!isHeader && (
          <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 z-40 mt-1 max-h-48 overflow-auto rounded border border-border bg-surface shadow-lg ${
            isHeader ? 'top-full min-w-[12rem]' : 'right-0 top-full'
          }`}
        >
          {groups.map(([group, entries]) => {
            const collapsed = collapsedGroups.has(group);
            return (
              <div key={group} className="border-b border-border/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] uppercase tracking-wider text-muted hover:bg-surface-muted"
                  aria-expanded={!collapsed}
                >
                  {collapsed
                    ? <ChevronRight size={12} className="shrink-0" />
                    : <ChevronDown size={12} className="shrink-0" />}
                  <span className="truncate">{group}</span>
                  <span className="ml-auto text-[9px] normal-case tracking-normal">{entries.length}</span>
                </button>
                {!collapsed && (
                  <div className="pb-1">
                    {entries.map((entry) => {
                      const selected = entry.field === value;
                      return (
                        <button
                          key={entry.field}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => selectField(entry.field)}
                          className={`block w-full truncate px-3 py-1 text-left text-[11px] ${
                            selected
                              ? 'bg-accent text-on-accent'
                              : 'text-secondary hover:bg-surface-muted'
                          }`}
                          title={entry.field.startsWith('property:') ? entry.field.slice('property:'.length) : entry.label}
                        >
                          {entry.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BimElementTable({
  elements,
  properties = [],
  selectedElementId,
  search,
  ifcClassFilter,
  columns,
  tableSort = { columnId: null, direction: null },
  title = 'Elements',
  colorByActive = false,
  colorByProperty = null,
  onSearchChange,
  onIfcClassFilterChange,
  onColumnsChange,
  onTableSortChange,
  onSelectElement,
}) {
  const rowRefs = useRef(new Map());
  const tableRootRef = useRef(null);
  const headerRef = useRef(null);
  const resizeStateRef = useRef(null);
  const [dragColumnId, setDragColumnId] = useState(null);
  const [addColumnField, setAddColumnField] = useState('property:Archicad Properties.Layer');
  const [removeColumnId, setRemoveColumnId] = useState(columns[0]?.id ?? '');
  const [sortMenu, setSortMenu] = useState(null);

  const propertiesByElement = useMemo(
    () => buildPropertiesByElement({ properties }),
    [properties],
  );
  const catalog = useMemo(() => buildTableColumnCatalog(properties), [properties]);
  const classes = useMemo(
    () => [...new Set(elements.map((element) => element.ifcClass).filter(Boolean))].sort(),
    [elements],
  );
  const gridTemplate = useMemo(() => {
    const base = tableColumnGridTemplate(columns);
    return colorByActive ? `${COLOR_BY_SWATCH_GRID_COLUMN} ${base}` : base;
  }, [colorByActive, columns]);
  const effectiveColorByProperty = colorByProperty ?? BIM_COLOR_BY_DEFAULT_PROPERTY;
  const preparedModel = useMemo(() => ({ properties }), [properties]);

  useEffect(() => {
    if (catalog.some((entry) => entry.field === addColumnField)) return;
    setAddColumnField(catalog[0]?.field ?? 'element:name');
  }, [addColumnField, catalog]);

  useEffect(() => {
    if (columns.some((column) => column.id === removeColumnId)) return;
    setRemoveColumnId(columns[0]?.id ?? '');
  }, [columns, removeColumnId]);

  const columnRemoveOptions = useMemo(
    () => columns.map((column) => ({
      id: column.id,
      label: tableColumnLabel(column.field, catalog),
    })),
    [catalog, columns],
  );

  useEffect(() => {
    const onPointerMove = (event) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const headerWidth = headerRef.current?.clientWidth ?? 1;
      const deltaFr = ((event.clientX - state.startX) / headerWidth) * state.totalFr;
      onColumnsChange(resizeTableColumns(state.startColumns, state.index, deltaFr));
    };
    const onPointerUp = () => {
      resizeStateRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onColumnsChange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return elements.filter((element) => {
      if (ifcClassFilter && element.ifcClass !== ifcClassFilter) return false;
      if (!q) return true;
      const elementProperties = propertiesByElement.get(element.id) ?? [];
      const searchableValues = [
        element.name,
        element.ifcClass,
        element.ifcGlobalId,
        element.typeName,
        element.storeyId,
        ...searchableTableColumnValues(element, elementProperties, columns),
      ];
      return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(q));
    });
  }, [columns, elements, ifcClassFilter, propertiesByElement, search]);

  const sortedRows = useMemo(
    () => sortTableElements(filtered, columns, propertiesByElement, tableSort),
    [columns, filtered, propertiesByElement, tableSort],
  );

  useEffect(() => {
    if (!selectedElementId) return;
    const row = rowRefs.current.get(selectedElementId);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
  }, [selectedElementId, sortedRows]);

  useEffect(() => {
    if (!selectedElementId) return;
    const row = rowRefs.current.get(selectedElementId);
    if (!row) return;
    row.focus({ preventScroll: true });
  }, [selectedElementId]);

  const handleColumnDrop = (targetColumnId) => {
    if (!dragColumnId || dragColumnId === targetColumnId) return;
    onColumnsChange(reorderTableColumns(columns, dragColumnId, targetColumnId));
    setDragColumnId(null);
  };

  const startColumnResize = (index, event) => {
    event.preventDefault();
    event.stopPropagation();
    const totalFr = columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
    resizeStateRef.current = {
      index,
      startX: event.clientX,
      startColumns: columns,
      totalFr,
    };
  };

  const handleSortSelection = (direction) => {
    if (!sortMenu) return;
    if (direction === 'default') {
      onTableSortChange?.({ columnId: null, direction: null });
    } else {
      onTableSortChange?.({ columnId: sortMenu.columnId, direction });
    }
    setSortMenu(null);
  };

  const handleRemoveColumn = () => {
    if (!removeColumnId) return;
    onColumnsChange(removeTableColumn(columns, removeColumnId));
    if (tableSort?.columnId === removeColumnId) {
      onTableSortChange?.({ columnId: null, direction: null });
    }
  };

  return (
    <div ref={tableRootRef} className="h-full min-h-0 flex flex-col bg-surface">
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

      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Columns</div>
        <div className="flex gap-1">
          <ColumnFieldSelect
            value={addColumnField}
            catalog={catalog}
            onChange={setAddColumnField}
            className="min-w-0 flex-1"
            ariaLabel="Attribute to add as column"
          />
          <button
            type="button"
            onClick={() => onColumnsChange(addTableColumn(columns, addColumnField))}
            disabled={columns.length >= 12}
            className="shrink-0 w-14 rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:opacity-40"
          >
            Add
          </button>
        </div>
        <div className="mt-1 flex gap-1">
          <ColumnListSelect
            value={removeColumnId}
            options={columnRemoveOptions}
            onChange={setRemoveColumnId}
            className="min-w-0 flex-1"
            ariaLabel="Column to remove"
          />
          <button
            type="button"
            onClick={handleRemoveColumn}
            disabled={columns.length <= 1 || !removeColumnId}
            className="shrink-0 w-14 rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      <div
        ref={headerRef}
        className="relative shrink-0 grid gap-0 overflow-visible border-b border-border px-2"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {colorByActive ? (
          <div className="py-1.5" aria-hidden="true" />
        ) : null}
        {columns.map((column, index) => (
          <div
            key={column.id}
            className={`relative flex min-w-0 items-center gap-0.5 py-1.5 pl-1 pr-2 ${
              index < columns.length - 1
                ? "after:pointer-events-none after:absolute after:right-0 after:top-1.5 after:bottom-1.5 after:w-px after:bg-border after:content-['']"
                : ''
            } ${
              dragColumnId === column.id ? 'bg-accent/10' : ''
            }`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleColumnDrop(column.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setSortMenu({ columnId: column.id });
            }}
          >
            <button
              type="button"
              draggable
              onDragStart={() => setDragColumnId(column.id)}
              onDragEnd={() => setDragColumnId(null)}
              className="shrink-0 cursor-grab text-muted hover:text-primary"
              aria-label={`Reorder ${tableColumnLabel(column.field, catalog)} column`}
              title="Drag to reorder"
            >
              <GripVertical size={12} />
            </button>
            <ColumnFieldSelect
              value={column.field}
              catalog={catalog}
              onChange={(field) => onColumnsChange(updateTableColumnField(columns, column.id, field))}
              className="min-w-0 flex-1"
              ariaLabel={`Column attribute for ${tableColumnLabel(column.field, catalog)}`}
              variant="header"
              sortDirection={
                tableSort?.columnId === column.id ? tableSort.direction : null
              }
            />
            {sortMenu?.columnId === column.id ? (
              <ColumnSortMenu
                columnId={column.id}
                tableSort={tableSort}
                onSelect={handleSortSelection}
                onClose={() => setSortMenu(null)}
                boundaryRef={tableRootRef}
              />
            ) : null}
            {index < columns.length - 1 && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${tableColumnLabel(column.field, catalog)} column`}
                onPointerDown={(event) => startColumnResize(index, event)}
                className="absolute -right-px top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center hover:[&>span]:bg-accent"
              >
                <span className="h-[calc(100%-0.75rem)] w-px bg-border" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {sortedRows.map((element) => {
          const elementProperties = propertiesByElement.get(element.id) ?? [];
          const isSelected = selectedElementId === element.id;
          const colorGroupLabel = colorByActive
            ? String(resolveColorByGroupKey(element, effectiveColorByProperty, preparedModel))
            : null;
          const colorSwatch = colorByActive
            ? resolveElementColorByPaletteColor(element, effectiveColorByProperty, preparedModel)
            : null;
          return (
            <button
              key={element.id}
              ref={(node) => {
                if (node) rowRefs.current.set(element.id, node);
                else rowRefs.current.delete(element.id);
              }}
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onSelectElement(element.id)}
              className={`w-full grid gap-0 px-2 text-left text-xs border-b border-border/70 ${
                isSelected
                  ? 'bg-accent text-on-accent'
                  : 'text-secondary hover:bg-surface-muted'
              }`}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {colorByActive ? (
                <ElementColorSwatch
                  color={colorSwatch}
                  label={colorGroupLabel}
                  selected={isSelected}
                />
              ) : null}
              {columns.map((column, columnIndex) => {
                const value = resolveTableColumnValue(element, elementProperties, column);
                const isMono = column.field === 'element:ifcGlobalId' || column.field === 'element:expressId';
                return (
                  <span
                    key={`${element.id}:${column.id}`}
                    className={`block min-w-0 truncate px-2 py-1.5 ${
                      columnIndex < columns.length - 1
                        ? "relative after:pointer-events-none after:absolute after:right-0 after:top-1.5 after:bottom-1.5 after:w-px after:bg-border after:content-['']"
                        : ''
                    } ${isMono ? 'font-mono text-[10px]' : ''}`}
                  >
                    {column.field === 'element:name' ? (value === '-' ? 'Unnamed' : value) : value}
                  </span>
                );
              })}
            </button>
          );
        })}
        {sortedRows.length === 0 && (
          <div className="p-4 text-xs text-muted text-center">No elements match this filter.</div>
        )}
      </div>
    </div>
  );
}
