import {
  ARTIFACT_TYPES,
  RELATION_TYPES,
  ASSERTION_STATUSES,
  TASK_TYPES,
} from '../primitives/shared/types.js';
import {
  getPrimitiveKindColor,
  getSubtypeColor,
  getEventActionColor,
} from './primitiveTreeColors.js';

const KNOWN_EVENT_ACTIONS = ['created', 'updated', 'archived'];

function sortByCreatedDesc(a, b) {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}

function makeLeaf({ id, label, color, primitiveRef, created_at }) {
  return {
    id,
    label,
    kind: 'leaf',
    color,
    primitiveRef,
    created_at,
    children: [],
  };
}

function makeSubtype({ sectionId, subtype, children }) {
  return {
    id: `${sectionId}::${subtype}`,
    label: subtype,
    kind: 'subtype',
    color: getSubtypeColor(sectionId, subtype),
    count: children.length,
    children,
  };
}

function makeSection({ id, label, kindColor, children }) {
  const count = children.reduce(
    (n, c) => n + (c.kind === 'leaf' ? 1 : c.count ?? c.children?.length ?? 0),
    0,
  );
  return {
    id,
    label,
    kind: 'section',
    color: kindColor,
    count,
    children,
  };
}

function groupItemsBySubtype(items, subtypeKeys, getSubtype) {
  const buckets = new Map(subtypeKeys.map((k) => [k, []]));
  const other = [];
  for (const item of items) {
    const key = getSubtype(item);
    if (key && buckets.has(key)) buckets.get(key).push(item);
    else other.push(item);
  }
  if (other.length) {
    if (!buckets.has('other')) buckets.set('other', []);
    buckets.get('other').push(...other);
  }
  return buckets;
}

function artifactSection(items) {
  const artifacts = items.filter((i) => i.type === 'artifact');
  const keys = [...ARTIFACT_TYPES];
  const buckets = groupItemsBySubtype(
    artifacts,
    keys,
    (i) => i.status || i.subtype || 'other',
  );
  const subtypes = keys.map((t) => {
    const leaves = (buckets.get(t) || [])
      .sort(sortByCreatedDesc)
      .map((i) =>
        makeLeaf({
          id: `artifact-${i.id}`,
          label: i.summary?.replace(/^[^:]+:\s*/, '') || i.id,
          color: getSubtypeColor('artifacts', t),
          primitiveRef: { type: 'artifact', id: i.id },
          created_at: i.created_at,
        }),
      );
    return makeSubtype({ sectionId: 'artifacts', subtype: t, children: leaves });
  });
  return makeSection({
    id: 'artifacts',
    label: 'Artifacts',
    kindColor: getPrimitiveKindColor('artifact'),
    children: subtypes,
  });
}

function notesSection(items) {
  const notes = items
    .filter((i) => i.type === 'note')
    .sort(sortByCreatedDesc)
    .map((i) =>
      makeLeaf({
        id: `note-${i.id}`,
        label: i.summary || i.id,
        color: getPrimitiveKindColor('note'),
        primitiveRef: { type: 'note', id: i.id },
        created_at: i.created_at,
      }),
    );
  return makeSection({
    id: 'notes',
    label: 'Notes',
    kindColor: getPrimitiveKindColor('note'),
    children: notes,
  });
}

function relationshipsSection(items) {
  const rels = items.filter((i) => i.type === 'relationship');
  const buckets = groupItemsBySubtype(rels, [...RELATION_TYPES], (i) => i.subtype);
  const subtypes = RELATION_TYPES.map((t) => {
    const leaves = (buckets.get(t) || [])
      .sort(sortByCreatedDesc)
      .map((i) =>
        makeLeaf({
          id: `relationship-${i.id}`,
          label: i.summary || i.id,
          color: getSubtypeColor('relationships', t),
          primitiveRef: { type: 'relationship', id: i.id },
          created_at: i.created_at,
        }),
      );
    return makeSubtype({ sectionId: 'relationships', subtype: t, children: leaves });
  });
  return makeSection({
    id: 'relationships',
    label: 'Relationships',
    kindColor: getPrimitiveKindColor('relationship'),
    children: subtypes,
  });
}

function assertionsSection(items) {
  const assertions = items.filter((i) => i.type === 'assertion');
  const buckets = groupItemsBySubtype(assertions, [...ASSERTION_STATUSES], (i) => i.status);
  const subtypes = ASSERTION_STATUSES.map((t) => {
    const leaves = (buckets.get(t) || [])
      .sort(sortByCreatedDesc)
      .map((i) =>
        makeLeaf({
          id: `assertion-${i.id}`,
          label: i.summary || i.id,
          color: getSubtypeColor('assertions', t),
          primitiveRef: { type: 'assertion', id: i.id },
          created_at: i.created_at,
        }),
      );
    return makeSubtype({ sectionId: 'assertions', subtype: t, children: leaves });
  });
  return makeSection({
    id: 'assertions',
    label: 'Assertions',
    kindColor: getPrimitiveKindColor('assertion'),
    children: subtypes,
  });
}

function tasksSection(items) {
  const tasks = items.filter((i) => i.type === 'task');
  const buckets = groupItemsBySubtype(tasks, [...TASK_TYPES], (i) => i.subtype);
  const subtypes = TASK_TYPES.map((t) => {
    const leaves = (buckets.get(t) || [])
      .sort(sortByCreatedDesc)
      .map((i) =>
        makeLeaf({
          id: `task-${i.id}`,
          label: i.summary || i.id,
          color: getSubtypeColor('tasks', t),
          primitiveRef: { type: 'task', id: i.id },
          created_at: i.created_at,
        }),
      );
    return makeSubtype({ sectionId: 'tasks', subtype: t, children: leaves });
  });
  return makeSection({
    id: 'tasks',
    label: 'Tasks',
    kindColor: getPrimitiveKindColor('task'),
    children: subtypes,
  });
}

function clustersSection(items, subclusters) {
  const fromList = items.filter((i) => i.type === 'cluster');
  const byId = new Map(fromList.map((i) => [i.id, i]));
  for (const c of subclusters || []) {
    if (!byId.has(c.id)) {
      byId.set(c.id, {
        type: 'cluster',
        id: c.id,
        summary: c.name,
        status: c.status,
        created_at: c.created_at,
      });
    }
  }
  const leaves = [...byId.values()]
    .sort(sortByCreatedDesc)
    .map((i) =>
      makeLeaf({
        id: `cluster-${i.id}`,
        label: i.summary || i.id,
        color: getPrimitiveKindColor('cluster'),
        primitiveRef: { type: 'cluster', id: i.id },
        created_at: i.created_at,
      }),
    );
  return makeSection({
    id: 'clusters',
    label: 'Clusters',
    kindColor: getPrimitiveKindColor('cluster'),
    children: leaves,
  });
}

function eventsSection(events) {
  const eventItems = events || [];
  const actionSet = new Set([...KNOWN_EVENT_ACTIONS]);
  for (const e of eventItems) actionSet.add(e.action);

  const buckets = new Map([...actionSet].map((a) => [a, []]));
  for (const e of eventItems) {
    const key = e.action || 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  }

  const orderedActions = [
    ...KNOWN_EVENT_ACTIONS,
    ...[...actionSet].filter((a) => !KNOWN_EVENT_ACTIONS.includes(a)).sort(),
  ];

  const subtypes = orderedActions.map((action) => {
    const leaves = (buckets.get(action) || [])
      .sort((a, b) => {
        const ta = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
        const tb = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
        return tb - ta;
      })
      .map((e) =>
        makeLeaf({
          id: `event-${e.id}`,
          label: `${e.target_type} ${e.target_id?.slice(0, 8) ?? ''}`,
          color: getEventActionColor(action),
          primitiveRef: { type: e.target_type, id: e.target_id },
          created_at: e.occurred_at,
        }),
      );
    return makeSubtype({ sectionId: 'events', subtype: action, children: leaves });
  });

  return makeSection({
    id: 'events',
    label: 'Events',
    kindColor: getPrimitiveKindColor('event'),
    children: subtypes,
  });
}

/**
 * @param {{ projectName: string, items: object[], events: object[], subclusters: object[] }} input
 */
export function buildWorkspaceTree({ projectName, items = [], events = [], subclusters = [] }) {
  const sections = [
    clustersSection(items, subclusters),
    artifactSection(items),
    notesSection(items),
    relationshipsSection(items),
    assertionsSection(items),
    tasksSection(items),
    eventsSection(events),
  ];

  const totalCount = sections.reduce((n, s) => n + (s.count || 0), 0);

  return {
    id: 'workspace-root',
    label: projectName || 'Workspace',
    kind: 'root',
    color: getPrimitiveKindColor('artifact'),
    count: totalCount,
    children: sections,
  };
}
