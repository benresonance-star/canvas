import React, { useMemo } from 'react';
import {
  filterInspectorIdentityFields,
  filterInspectorMemberships,
  filterInspectorPropertyGroups,
  filterInspectorProvenance,
  inspectorHasVisibleContent,
} from '../bim-core/bimInspectorSearch.js';

function groupProperties(properties) {
  const groups = new Map();
  properties.forEach((property) => {
    const key = property.psetName || 'Properties';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(property);
  });
  return [...groups.entries()];
}

const INSET_VERTICAL_DIVIDER =
  "relative after:pointer-events-none after:absolute after:right-0 after:top-1.5 after:bottom-1.5 after:w-px after:bg-border after:content-['']";

const INSPECTOR_LABEL_CLASS = `text-muted break-words min-w-0 whitespace-normal px-2 py-1.5 border-b border-border/70 ${INSET_VERTICAL_DIVIDER}`;
const INSPECTOR_VALUE_CLASS = 'text-secondary break-words min-w-0 whitespace-normal px-2 py-1.5 border-b border-border/70';

function InspectorPropertyGrid({ children, className = '' }) {
  return (
    <dl className={`grid grid-cols-[minmax(8rem,1.1fr)_minmax(0,1fr)] gap-0 text-xs ${className}`}>
      {children}
    </dl>
  );
}

export function BimInspector({
  element,
  properties,
  provenance,
  assemblies,
  assemblyMembers,
  search = '',
  onSearchChange,
  floating = false,
}) {
  const shellClass = floating
    ? 'h-full min-h-0 bg-transparent'
    : 'h-full min-h-0 border-l border-border bg-surface';
  const grouped = useMemo(() => groupProperties(properties), [properties]);
  const memberships = useMemo(() => {
    if (!element) return [];
    const byId = new Map(assemblies.map((assembly) => [assembly.id, assembly]));
    return assemblyMembers
      .filter((member) => member.elementId === element.id)
      .map((member) => ({ ...member, assembly: byId.get(member.assemblyId) }))
      .filter((member) => member.assembly);
  }, [assemblies, assemblyMembers, element]);

  const identityRows = useMemo(
    () => (element ? filterInspectorIdentityFields(element, search) : []),
    [element, search],
  );
  const visibleMemberships = useMemo(
    () => filterInspectorMemberships(memberships, search),
    [memberships, search],
  );
  const visiblePropertyGroups = useMemo(
    () => filterInspectorPropertyGroups(grouped, search),
    [grouped, search],
  );
  const visibleProvenance = useMemo(
    () => filterInspectorProvenance(provenance, search),
    [provenance, search],
  );
  const hasVisibleContent = useMemo(
    () => inspectorHasVisibleContent({
      identityRows,
      propertyGroups: visiblePropertyGroups,
      provenance: visibleProvenance,
      memberships: visibleMemberships,
    }),
    [identityRows, visibleMemberships, visiblePropertyGroups, visibleProvenance],
  );
  const trimmedSearch = search.trim();

  if (!element) {
    return (
      <div className={`${shellClass} p-4 text-sm text-muted`}>
        Select an element to inspect IFC evidence.
      </div>
    );
  }

  return (
    <div className={`${shellClass} flex flex-col overflow-hidden`}>
      <div className="shrink-0 border-b border-border p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted">Inspector</div>
        <h3 className="serif text-base text-primary mt-1">{element.name || 'Unnamed element'}</h3>
        <div className="sans text-xs text-muted mt-1">{element.ifcClass} · {element.ifcGlobalId}</div>
      </div>
      <div className="shrink-0 border-b border-border p-2">
        <input
          value={search}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Search attributes"
          aria-label="Search attributes"
          className="min-w-0 w-full rounded border border-border bg-preview-bg px-2 py-1 text-xs text-primary outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto divide-y divide-border">
        {identityRows.length > 0 && (
          <section className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Identity</div>
            <InspectorPropertyGrid>
              {identityRows.map((row) => (
                <React.Fragment key={row.label}>
                  <dt className={INSPECTOR_LABEL_CLASS}>{row.label}</dt>
                  <dd className={INSPECTOR_VALUE_CLASS}>{row.value}</dd>
                </React.Fragment>
              ))}
            </InspectorPropertyGrid>
          </section>
        )}
        {visibleMemberships.length > 0 && (
          <section className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Semantic Assembly</div>
            {visibleMemberships.map((member) => (
              <div key={`${member.assemblyId}:${member.elementId}`} className="rounded border border-border p-2 text-xs text-secondary">
                <div>{member.assembly.kind} · {member.assembly.id}</div>
                <div className="text-muted mt-1">Role: {member.memberRole || '-'}</div>
              </div>
            ))}
          </section>
        )}
        {visiblePropertyGroups.length > 0 && (
          <section>
            <div className="border-b border-border px-3 py-1 text-[10px] uppercase tracking-wider text-muted">
              Properties
            </div>
            {visiblePropertyGroups.map(([group, entries]) => (
              <div key={group} className="border-b border-border last:border-b-0">
                <div className="border-b border-border px-3 py-1 text-xs font-semibold text-secondary">
                  {group}
                </div>
                <InspectorPropertyGrid>
                  {entries.map((property) => (
                    <React.Fragment key={property.id}>
                      <dt className={INSPECTOR_LABEL_CLASS} title={property.propertyName}>
                        {property.propertyName}
                      </dt>
                      <dd className={INSPECTOR_VALUE_CLASS} title={String(property.value ?? '')}>
                        {String(property.value ?? '')}
                      </dd>
                    </React.Fragment>
                  ))}
                </InspectorPropertyGrid>
              </div>
            ))}
          </section>
        )}
        {grouped.length === 0 && !trimmedSearch && (
          <section className="p-3">
            <div className="border-b border-border px-0 py-1 text-[10px] uppercase tracking-wider text-muted">
              Properties
            </div>
            <div className="pt-3 text-xs text-muted">No projected properties yet.</div>
          </section>
        )}
        {visibleProvenance.length > 0 && (
          <section className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Provenance</div>
            {visibleProvenance.map((record) => (
              <div key={record.id} className="text-xs text-secondary rounded border border-border p-2 mb-2 last:mb-0">
                {record.extractionRule} · {record.sourceFileHash}
              </div>
            ))}
          </section>
        )}
        {provenance.length === 0 && !trimmedSearch && (
          <section className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Provenance</div>
            <div className="text-xs text-muted">No provenance records yet.</div>
          </section>
        )}
        {trimmedSearch && !hasVisibleContent && (
          <div className="p-4 text-xs text-muted text-center">No attributes match this filter.</div>
        )}
      </div>
    </div>
  );
}
