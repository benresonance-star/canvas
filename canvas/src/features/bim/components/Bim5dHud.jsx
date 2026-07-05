import React, { useMemo, useState } from 'react';
import { buildBim5dTakeoffRows, summarizeBim5dTakeoff } from '../bim-core/bim5d.js';

function formatMoney(value, currency) {
  const numeric = Number(value) || 0;
  return `${currency} ${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function Bim5dHud({
  preparedModel,
  costPlans = [],
  activeCostPlanId = null,
  savedResultSets = [],
  onCreateCostPlan = () => {},
  onSetActiveCostPlan = () => {},
  onPatchCostPlan = () => {},
  onAddRateRow = () => {},
  onSelectTakeoffRow = () => {},
}) {
  const [rateLabel, setRateLabel] = useState('');
  const [quantityName, setQuantityName] = useState('Area');
  const [unitCost, setUnitCost] = useState('0');
  const activePlan = costPlans.find((plan) => plan.id === activeCostPlanId) ?? costPlans[0] ?? null;
  const rows = useMemo(
    () => (activePlan ? buildBim5dTakeoffRows(preparedModel, activePlan, savedResultSets) : []),
    [activePlan, preparedModel, savedResultSets],
  );
  const summary = useMemo(() => summarizeBim5dTakeoff(rows), [rows]);

  return (
    <div className="pointer-events-auto w-[30rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface/95 p-3 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">5D takeoff</div>
          <div className="text-secondary">{activePlan?.name ?? 'No cost plan'}</div>
        </div>
        <button
          type="button"
          onClick={onCreateCostPlan}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted"
        >
          New
        </button>
      </div>

      {costPlans.length > 0 && (
        <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
          <select
            value={activePlan?.id ?? ''}
            onChange={(event) => onSetActiveCostPlan(event.target.value)}
            className="rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
            aria-label="5D cost plan"
          >
            {costPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>
          <select
            value={activePlan?.groupBy ?? 'ifcClass'}
            onChange={(event) => onPatchCostPlan({ groupBy: event.target.value })}
            className="rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
            aria-label="5D group by"
          >
            <option value="ifcClass">Class</option>
            <option value="typeName">Type</option>
            <option value="storey">Storey</option>
            <option value="layer">Layer</option>
            <option value="classification">Classification</option>
            <option value="resultSet">Result set</option>
          </select>
        </div>
      )}

      <div className="mb-2 grid grid-cols-[1fr_5rem_5rem_auto] gap-2">
        <input
          value={rateLabel}
          onChange={(event) => setRateLabel(event.target.value)}
          placeholder="Rate label"
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
        />
        <input
          value={quantityName}
          onChange={(event) => setQuantityName(event.target.value)}
          aria-label="Quantity name"
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
        />
        <input
          value={unitCost}
          type="number"
          onChange={(event) => setUnitCost(event.target.value)}
          aria-label="Unit cost"
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-secondary"
        />
        <button
          type="button"
          disabled={!activePlan}
          onClick={() => {
            onAddRateRow({
              label: rateLabel || `${quantityName} rate`,
              quantityName,
              unitCost: Number(unitCost),
            });
            setRateLabel('');
          }}
          className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2 rounded border border-border bg-preview-bg/60 p-2 text-[10px] uppercase tracking-wider text-muted">
        <div>{summary.elementCount} elements</div>
        <div>{summary.rowCount} rows</div>
        <div className="text-right text-secondary">{formatMoney(summary.totalCost, activePlan?.currency ?? 'USD')}</div>
      </div>

      <div className="max-h-64 overflow-auto rounded border border-border">
        {rows.length === 0 ? (
          <div className="px-2 py-3 text-muted">Create a cost plan to build an IFC quantity takeoff.</div>
        ) : rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelectTakeoffRow(row)}
            className="grid w-full grid-cols-[1fr_6rem_6rem] gap-2 border-b border-border px-2 py-1.5 text-left text-secondary hover:bg-surface-muted last:border-b-0"
          >
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="text-right font-mono text-[10px]">{row.quantityValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}</span>
            <span className="text-right font-mono text-[10px]">{formatMoney(row.totalCost, row.currency)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
