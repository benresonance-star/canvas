/**
 * @vitest-environment happy-dom
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import React, { useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BimElementTable } from '../BimElementTable.jsx';
import { DEFAULT_TABLE_COLUMNS } from '../../bim-core/bimTableColumns.js';

const roofElement = {
  id: 'ifc:slab-roof',
  expressId: 7,
  ifcGlobalId: '21PJF2_ez6UhhFh',
  ifcClass: 'IfcSlab',
  name: 'Slab-007',
  typeName: 'Sketch De...',
  storeyId: 'ROOF',
};

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function ControlledTable({ initialSearch = '' }) {
  const [search, setSearch] = useState(initialSearch);
  const [columns, setColumns] = useState(DEFAULT_TABLE_COLUMNS);
  return React.createElement(BimElementTable, {
    elements: [roofElement],
    properties: [],
    selectedElementId: roofElement.id,
    search,
    ifcClassFilter: '',
    columns,
    tableSort: { columnId: null, direction: null },
    onSearchChange: setSearch,
    onIfcClassFilterChange: () => {},
    onColumnsChange: setColumns,
    onTableSortChange: () => {},
    onSelectElement: () => {},
  });
}

function renderTable() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(ControlledTable));
  });

  const searchInput = container.querySelector('input[placeholder="Search elements"]');
  expect(searchInput).toBeTruthy();

  return {
    searchInput,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('BimElementTable search focus', () => {
  it('keeps search input focused while typing with a selected row', () => {
    const { searchInput, unmount } = renderTable();

    act(() => {
      searchInput.focus();
    });
    expect(document.activeElement).toBe(searchInput);

    for (const value of ['r', 'ro', 'roo', 'roof']) {
      act(() => {
        setInputValue(searchInput, value);
      });
      expect(document.activeElement).toBe(searchInput);
      expect(searchInput.value).toBe(value);
    }

    unmount();
  });
});
