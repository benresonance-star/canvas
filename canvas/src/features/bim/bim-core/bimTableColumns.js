const BUILTIN_FIELDS = [
  { field: 'element:name', label: 'Name' },
  { field: 'element:ifcClass', label: 'Class' },
  { field: 'element:ifcGlobalId', label: 'Global ID' },
  { field: 'element:storeyId', label: 'Storey' },
  { field: 'element:typeName', label: 'Type' },
  { field: 'element:expressId', label: 'Express ID' },
];

export const DEFAULT_TABLE_COLUMNS = [
  { id: 'name', field: 'element:name', width: 1.1 },
  { id: 'class', field: 'element:ifcClass', width: 0.75 },
  { id: 'globalId', field: 'element:ifcGlobalId', width: 1.1 },
  { id: 'storey', field: 'element:storeyId', width: 0.8 },
  { id: 'type', field: 'element:typeName', width: 0.9 },
];

export const TABLE_SORT_DIRECTIONS = ['asc', 'desc'];

const BUILTIN_FIELD_SET = new Set(BUILTIN_FIELDS.map((entry) => entry.field));
const MAX_TABLE_COLUMNS = 12;
const MIN_COLUMN_WIDTH = 0.4;

function createColumnId(index = 0) {
  return `col-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeField(field) {
  const value = String(field ?? '').trim();
  if (!value) return null;
  if (value.startsWith('element:') && BUILTIN_FIELD_SET.has(value)) return value;
  if (value.startsWith('property:')) {
    const path = value.slice('property:'.length).trim();
    if (!path) return null;
    return `property:${path}`;
  }
  return null;
}

function normalizeColumnWidth(width) {
  const numeric = Number(width);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(MIN_COLUMN_WIDTH, numeric);
}

function normalizeColumn(column, index) {
  const field = normalizeField(column?.field);
  if (!field) return null;
  const id = String(column?.id ?? createColumnId(index)).trim() || createColumnId(index);
  return { id, field, width: normalizeColumnWidth(column?.width) };
}

export function normalizeTableColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return DEFAULT_TABLE_COLUMNS.map((column, index) => normalizeColumn(column, index));
  }
  const normalized = columns
    .map((column, index) => normalizeColumn(column, index))
    .filter(Boolean)
    .slice(0, MAX_TABLE_COLUMNS);
  return normalized.length > 0
    ? normalized
    : DEFAULT_TABLE_COLUMNS.map((column, index) => normalizeColumn(column, index));
}

export function normalizeTableSort(sort, columns = []) {
  const columnId = sort?.columnId == null ? null : String(sort.columnId);
  const direction = TABLE_SORT_DIRECTIONS.includes(sort?.direction) ? sort.direction : null;
  if (!columnId || !direction) {
    return { columnId: null, direction: null };
  }
  if (!columns.some((column) => column.id === columnId)) {
    return { columnId: null, direction: null };
  }
  return { columnId, direction };
}

function compareSortValues(left, right) {
  if (left === right) return 0;
  if (left === '-') return 1;
  if (right === '-') return -1;
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) return leftNum - rightNum;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortTableElements(elements, columns, propertiesByElement, sort) {
  const normalizedSort = normalizeTableSort(sort, columns);
  if (!normalizedSort.columnId || !normalizedSort.direction) return elements;
  const column = columns.find((entry) => entry.id === normalizedSort.columnId);
  if (!column) return elements;
  const direction = normalizedSort.direction === 'desc' ? -1 : 1;
  return [...elements].sort((left, right) => {
    const leftValue = resolveTableColumnValue(left, propertiesByElement.get(left.id) ?? [], column);
    const rightValue = resolveTableColumnValue(right, propertiesByElement.get(right.id) ?? [], column);
    return direction * compareSortValues(leftValue, rightValue);
  });
}

export function buildTableColumnCatalog(properties = []) {
  const builtinOptions = BUILTIN_FIELDS.map((entry) => ({
    field: entry.field,
    label: entry.label,
    group: 'Element',
  }));

  const propertyPaths = new Map();
  for (const property of properties) {
    const psetName = String(property?.psetName ?? 'Properties').trim() || 'Properties';
    const propertyName = String(property?.propertyName ?? '').trim();
    if (!propertyName) continue;
    const field = `property:${psetName}.${propertyName}`;
    if (propertyPaths.has(field)) continue;
    propertyPaths.set(field, {
      field,
      label: propertyName,
      group: psetName,
    });
  }

  const propertyOptions = [...propertyPaths.values()].sort((left, right) => {
    const groupCompare = left.group.localeCompare(right.group, undefined, { sensitivity: 'base' });
    if (groupCompare !== 0) return groupCompare;
    return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
  });

  return [...builtinOptions, ...propertyOptions];
}

export function tableColumnLabel(field, catalog = []) {
  const match = catalog.find((entry) => entry.field === field);
  if (match) return match.label;
  if (field?.startsWith('property:')) return field.slice('property:'.length);
  const builtin = BUILTIN_FIELDS.find((entry) => entry.field === field);
  return builtin?.label ?? field;
}

function propertyMatchesPath(property, path) {
  const fullPath = `${property.psetName}.${property.propertyName}`;
  return fullPath === path || property.propertyName === path;
}

export function resolveTableColumnValue(element, properties = [], column) {
  if (!element || !column?.field) return '';

  if (column.field.startsWith('element:')) {
    const key = column.field.slice('element:'.length);
    const value = element[key];
    if (value == null || value === '') return '-';
    return String(value);
  }

  if (column.field.startsWith('property:')) {
    const path = column.field.slice('property:'.length);
    const match = properties.find((property) => propertyMatchesPath(property, path));
    if (match?.value == null || match.value === '') return '-';
    return String(match.value);
  }

  return '-';
}

export function searchableTableColumnValues(element, properties = [], columns = []) {
  return columns.flatMap((column) => {
    const value = resolveTableColumnValue(element, properties, column);
    return value === '-' ? [] : [value];
  });
}

export function reorderTableColumns(columns, sourceId, targetId) {
  const list = [...columns];
  const sourceIndex = list.findIndex((column) => column.id === sourceId);
  const targetIndex = list.findIndex((column) => column.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return list;
  const [moved] = list.splice(sourceIndex, 1);
  list.splice(targetIndex, 0, moved);
  return list;
}

export function updateTableColumnField(columns, columnId, field) {
  const normalizedField = normalizeField(field);
  if (!normalizedField) return columns;
  return columns.map((column) => (
    column.id === columnId ? { ...column, field: normalizedField } : column
  ));
}

export function removeTableColumn(columns, columnId) {
  if (columns.length <= 1) return columns;
  return columns.filter((column) => column.id !== columnId);
}

export function addTableColumn(columns, field) {
  const normalizedField = normalizeField(field);
  if (!normalizedField || columns.length >= MAX_TABLE_COLUMNS) return columns;
  return [...columns, { id: createColumnId(columns.length), field: normalizedField, width: 1 }];
}

export function tableColumnGridTemplate(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return '1fr';
  return columns
    .map((column) => `minmax(3rem, ${normalizeColumnWidth(column.width)}fr)`)
    .join(' ');
}

export function resizeTableColumns(columns, index, deltaFr) {
  const left = columns[index];
  const right = columns[index + 1];
  if (!left || !right || !Number.isFinite(deltaFr) || deltaFr === 0) return columns;

  const leftWidth = normalizeColumnWidth(left.width);
  const rightWidth = normalizeColumnWidth(right.width);
  let nextLeft = leftWidth + deltaFr;
  let nextRight = rightWidth - deltaFr;

  if (nextLeft < MIN_COLUMN_WIDTH) {
    nextRight -= MIN_COLUMN_WIDTH - nextLeft;
    nextLeft = MIN_COLUMN_WIDTH;
  }
  if (nextRight < MIN_COLUMN_WIDTH) {
    nextLeft -= MIN_COLUMN_WIDTH - nextRight;
    nextRight = MIN_COLUMN_WIDTH;
  }

  nextLeft = Math.max(MIN_COLUMN_WIDTH, nextLeft);
  nextRight = Math.max(MIN_COLUMN_WIDTH, nextRight);

  return columns.map((column) => {
    if (column.id === left.id) return { ...column, width: nextLeft };
    if (column.id === right.id) return { ...column, width: nextRight };
    return column;
  });
}
