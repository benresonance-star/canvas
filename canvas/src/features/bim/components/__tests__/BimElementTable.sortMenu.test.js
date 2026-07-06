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

const element = {
  id: 'ifc:beam-016',
  expressId: 16,
  ifcGlobalId: 'beam-global-id',
  ifcClass: 'IfcBeam',
  name: 'Beam-016',
  typeName: 'Beam type',
  storeyId: 'GROUND FLOOR',
};

function ControlledTable() {
  const [columns, setColumns] = useState(DEFAULT_TABLE_COLUMNS);
  const [tableSort, setTableSort] = useState({ columnId: null, direction: null });
  return React.createElement(BimElementTable, {
    elements: [element],
    properties: [],
    selectedElementId: element.id,
    search: '',
    ifcClassFilter: '',
    columns,
    tableSort,
    onSearchChange: () => {},
    onIfcClassFilterChange: () => {},
    onColumnsChange: setColumns,
    onTableSortChange: setTableSort,
    onSelectElement: () => {},
  });
}

describe('BimElementTable sort menu', () => {
  it('opens the sort menu anchored below the column header', () => {
    const container = document.createElement('div');
    container.style.width = '320px';
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(ControlledTable));
    });

    const headerCell = container.querySelector('[aria-label="Column attribute for Name"]')?.closest('.relative.flex');
    expect(headerCell).toBeTruthy();

    act(() => {
      headerCell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });

    const menu = container.querySelector('[aria-label="Column sort"]');
    expect(menu).toBeTruthy();
    expect(menu.className).toContain('absolute');
    expect(menu.className).toContain('top-full');
    expect(menu.className).not.toContain('fixed');
    expect(headerCell.contains(menu)).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
