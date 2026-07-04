import React, { useMemo } from 'react';

function groupProperties(properties) {
  const groups = new Map();
  properties.forEach((property) => {
    const key = property.psetName || 'Properties';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(property);
  });
  return [...groups.entries()];
}

export function BimInspector({ element, properties, provenance, assemblies, assemblyMembers }) {
  const grouped = useMemo(() => groupProperties(properties), [properties]);
  const memberships = useMemo(() => {
    if (!element) return [];
    const byId = new Map(assemblies.map((assembly) => [assembly.id, assembly]));
    return assemblyMembers
      .filter((member) => member.elementId === element.id)
      .map((member) => ({ ...member, assembly: byId.get(member.assemblyId) }))
      .filter((member) => member.assembly);
  }, [assemblies, assemblyMembers, element]);

  if (!element) {
    return (
      <div className="h-full min-h-0 border-l border-border bg-surface p-4 text-sm text-muted">
        Select an element to inspect IFC evidence.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto border-l border-border bg-surface">
      <div className="p-3 border-b border-border">
        <div className="text-[10px] uppercase tracking-wider text-muted">Inspector</div>
        <h3 className="serif text-base text-primary mt-1">{element.name || 'Unnamed element'}</h3>
        <div className="sans text-xs text-muted mt-1">{element.ifcClass} · {element.ifcGlobalId}</div>
      </div>
      <div className="p-3 space-y-4">
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Identity</div>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted">Type</dt><dd className="text-secondary">{element.typeName || '-'}</dd>
            <dt className="text-muted">Storey</dt><dd className="text-secondary">{element.storeyId || '-'}</dd>
            <dt className="text-muted">Express ID</dt><dd className="text-secondary">{element.expressId ?? '-'}</dd>
          </dl>
        </section>
        {memberships.length > 0 && (
          <section>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Semantic Assembly</div>
            {memberships.map((member) => (
              <div key={`${member.assemblyId}:${member.elementId}`} className="rounded border border-border p-2 text-xs text-secondary">
                <div>{member.assembly.kind} · {member.assembly.id}</div>
                <div className="text-muted mt-1">Role: {member.memberRole || '-'}</div>
              </div>
            ))}
          </section>
        )}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Properties</div>
          {grouped.length === 0 ? (
            <div className="text-xs text-muted">No projected properties yet.</div>
          ) : grouped.map(([group, entries]) => (
            <div key={group} className="mb-3">
              <div className="text-xs font-semibold text-secondary mb-1">{group}</div>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 text-xs">
                {entries.map((property) => (
                  <React.Fragment key={property.id}>
                    <dt className="text-muted truncate">{property.propertyName}</dt>
                    <dd className="text-secondary break-words">{String(property.value ?? '')}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          ))}
        </section>
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Provenance</div>
          {provenance.length === 0 ? (
            <div className="text-xs text-muted">No provenance records yet.</div>
          ) : provenance.map((record) => (
            <div key={record.id} className="text-xs text-secondary rounded border border-border p-2 mb-2">
              {record.extractionRule} · {record.sourceFileHash}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
