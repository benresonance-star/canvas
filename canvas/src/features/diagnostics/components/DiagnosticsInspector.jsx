import React from 'react';
import { strings } from '../../../content/strings.js';

function IOList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2">
      <h4 className="sans text-[9px] uppercase tracking-wider text-muted">{title}</h4>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={`${item.name}-${item.type}`} className="sans text-[10px] text-secondary">
            <span className="text-primary">{item.name}</span>
            <span className="text-muted"> · </span>
            <span className="font-mono">{item.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BulletList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2">
      <h4 className="sans text-[9px] uppercase tracking-wider text-muted">{title}</h4>
      <ul className="mt-1 list-disc list-inside space-y-0.5">
        {items.map((item) => (
          <li key={item} className="sans text-[10px] text-secondary leading-snug">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function DiagnosticsInspector({ node, pipe, activePipes = [] }) {
  return (
    <section className="flex-1 overflow-y-auto p-3 min-h-0">
      <h2 className="sans text-[10px] uppercase tracking-wider text-muted">
        {strings.diagnostics.inspectorTitle}
      </h2>

      {node && (
        <div className="mt-2 rounded-md border border-border p-2">
          <p className="sans text-xs text-primary font-medium">{node.label}</p>
          <p className="sans text-[10px] text-muted mt-0.5">{node.component}</p>
          <p className="sans text-xs text-secondary mt-2 leading-snug">{node.purpose}</p>
          <p className="sans text-[10px] text-muted mt-2 leading-snug">
            <span className="uppercase tracking-wider">{strings.diagnostics.whyLabel}: </span>
            {node.why}
          </p>
          <BulletList title={strings.diagnostics.triggersLabel} items={node.triggers} />
          <IOList title={strings.diagnostics.inputsLabel} items={node.inputs} />
          <IOList title={strings.diagnostics.outputsLabel} items={node.outputs} />
          {node.functions?.length > 0 && (
            <BulletList title={strings.diagnostics.functionsLabel} items={node.functions} />
          )}
          <p className="sans text-[10px] text-muted mt-2 font-mono truncate" title={node.codeRef}>
            {node.codeRef}
          </p>
        </div>
      )}

      {pipe && (
        <div className="mt-3 rounded-md border border-border p-2">
          <p className="sans text-xs text-primary font-medium">{pipe.pipeLabel}</p>
          <p className="sans text-[10px] text-muted mt-0.5">
            {pipe.source} → {pipe.target}
          </p>
          <p className="sans text-xs text-secondary mt-2 leading-snug">{pipe.dataFlow}</p>
          <BulletList title={strings.diagnostics.payloadTypesLabel} items={pipe.payloadTypes} />
          <p className="sans text-[10px] text-muted mt-2 leading-snug">
            <span className="uppercase tracking-wider">{strings.diagnostics.triggerLabel}: </span>
            {pipe.trigger}
          </p>
          <p className="sans text-[10px] text-muted mt-1 leading-snug">
            <span className="uppercase tracking-wider">{strings.diagnostics.whyLabel}: </span>
            {pipe.why}
          </p>
        </div>
      )}

      {!node && !pipe && activePipes.length > 0 && (
        <div className="mt-2 space-y-2">
          <p className="sans text-[10px] text-muted">{strings.diagnostics.activePipesTitle}</p>
          {activePipes.map((p) => (
            <div key={p.id} className="rounded border border-border p-2">
              <p className="sans text-xs text-primary">{p.pipeLabel}</p>
              <p className="sans text-[10px] text-secondary mt-1">{p.dataFlow}</p>
              <p className="sans text-[9px] text-muted font-mono mt-1">{p.payloadTypes.join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {!node && !pipe && activePipes.length === 0 && (
        <p className="sans text-xs text-muted mt-2">{strings.diagnostics.inspectorEmpty}</p>
      )}
    </section>
  );
}
