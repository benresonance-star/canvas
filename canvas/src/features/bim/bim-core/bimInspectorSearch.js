function normalizeQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

export function inspectorTextMatchesSearch(text, query) {
  const q = normalizeQuery(query);
  if (!q) return true;
  return String(text ?? '').toLowerCase().includes(q);
}

export function inspectorFieldMatchesSearch(label, value, query) {
  const q = normalizeQuery(query);
  if (!q) return true;
  return inspectorTextMatchesSearch(label, q) || inspectorTextMatchesSearch(value, q);
}

export function filterInspectorIdentityFields(element, query) {
  const rows = [
    { label: 'Type', value: element.typeName || '-' },
    { label: 'Storey', value: element.storeyId || '-' },
    { label: 'Express ID', value: element.expressId ?? '-' },
  ];
  const q = normalizeQuery(query);
  if (!q) return rows;
  return rows.filter((row) => inspectorFieldMatchesSearch(row.label, row.value, q));
}

export function filterInspectorPropertyGroups(grouped, query) {
  const q = normalizeQuery(query);
  if (!q) return grouped;
  return grouped
    .map(([group, entries]) => {
      const groupMatches = inspectorTextMatchesSearch(group, q);
      const filteredEntries = groupMatches
        ? entries
        : entries.filter((property) => inspectorFieldMatchesSearch(
          property.propertyName,
          property.value,
          q,
        ));
      return [group, filteredEntries];
    })
    .filter(([, entries]) => entries.length > 0);
}

export function filterInspectorProvenance(provenance, query) {
  const q = normalizeQuery(query);
  if (!q) return provenance;
  return provenance.filter((record) => (
    inspectorFieldMatchesSearch('Provenance', record.extractionRule, q)
    || inspectorTextMatchesSearch(record.sourceFileHash, q)
  ));
}

export function filterInspectorMemberships(memberships, query) {
  const q = normalizeQuery(query);
  if (!q) return memberships;
  return memberships.filter((member) => (
    inspectorTextMatchesSearch(member.assembly?.kind, q)
    || inspectorTextMatchesSearch(member.assembly?.id, q)
    || inspectorFieldMatchesSearch('Role', member.memberRole, q)
  ));
}

export function inspectorHasVisibleContent({
  identityRows,
  propertyGroups,
  provenance,
  memberships,
}) {
  return (
    identityRows.length > 0
    || propertyGroups.length > 0
    || provenance.length > 0
    || memberships.length > 0
  );
}
