import { query } from '../db.js';

function truncate(s, n = 48) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const WORKSPACE_CLUSTER_SCOPE_CTE = `WITH RECURSIVE workspace_projects AS (
  SELECT
    project_row->>'id' AS project_id,
    COALESCE(project_row->>'name', project_row->>'id') AS project_name,
    COALESCE((project_row->>'archived')::boolean, false) AS project_archived,
    project_ordinality AS project_order
  FROM canvas_workspace_index cwi
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(cwi.payload->'projects', '[]'::jsonb)
  ) WITH ORDINALITY AS project_entries(project_row, project_ordinality)
  WHERE cwi.id = 'default'
),
cluster_scope AS (
  SELECT
    wp.project_id,
    wp.project_name,
    wp.project_archived,
    wp.project_order,
    c.id
  FROM project_cluster pc
  INNER JOIN workspace_projects wp ON wp.project_id = pc.project_id
  INNER JOIN cluster c ON c.id = pc.cluster_id
  WHERE c.status != 'archived'
  UNION ALL
  SELECT
    parent.project_id,
    parent.project_name,
    parent.project_archived,
    parent.project_order,
    c.id
  FROM cluster c
  INNER JOIN cluster_scope parent ON c.parent_cluster_id = parent.id
  WHERE c.status != 'archived'
)`;

const WORKSPACE_CLUSTER_ITEM_SCOPE_CTE = `WITH RECURSIVE workspace_projects AS (
  SELECT
    project_row->>'id' AS project_id,
    COALESCE(project_row->>'name', project_row->>'id') AS project_name,
    COALESCE((project_row->>'archived')::boolean, false) AS project_archived,
    project_ordinality AS project_order
  FROM canvas_workspace_index cwi
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(cwi.payload->'projects', '[]'::jsonb)
  ) WITH ORDINALITY AS project_entries(project_row, project_ordinality)
  WHERE cwi.id = 'default'
),
cluster_scope AS (
  SELECT
    wp.project_id,
    wp.project_name,
    wp.project_archived,
    wp.project_order,
    c.id,
    c.name,
    c.status,
    c.created_at
  FROM project_cluster pc
  INNER JOIN workspace_projects wp ON wp.project_id = pc.project_id
  INNER JOIN cluster c ON c.id = pc.cluster_id
  WHERE c.status != 'archived'
  UNION ALL
  SELECT
    parent.project_id,
    parent.project_name,
    parent.project_archived,
    parent.project_order,
    c.id,
    c.name,
    c.status,
    c.created_at
  FROM cluster c
  INNER JOIN cluster_scope parent ON c.parent_cluster_id = parent.id
  WHERE c.status != 'archived'
)`;

export async function listClusterPrimitives(clusterId, { type, limit = 100 } = {}) {
  const items = [];

  if (!type || type === 'artifact') {
    const arts = await query(
      `SELECT a.id, a.type, a.uri, a.content_hash, a.retrieved_at AS created_at, a.metadata
       FROM artifact a
       INNER JOIN cluster_member cm ON cm.primitive_id = a.id AND cm.primitive_type = 'artifact'
       WHERE cm.cluster_id = $1
       ORDER BY a.retrieved_at DESC
       LIMIT $2`,
      [clusterId, limit],
    );
    for (const row of arts.rows) {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      items.push({
        type: 'artifact',
        id: row.id,
        summary: `${row.type}: ${meta?.filename || truncate(row.uri)}`,
        status: row.type,
        created_at: row.created_at,
      });
    }
  }

  if (!type || type === 'note') {
    const notes = await query(
      `SELECT n.id, n.body, n.created_at
       FROM note n
       INNER JOIN cluster_member cm ON cm.primitive_id = n.id AND cm.primitive_type = 'note'
       WHERE cm.cluster_id = $1
       ORDER BY n.created_at DESC LIMIT $2`,
      [clusterId, limit],
    );
    for (const row of notes.rows) {
      items.push({
        type: 'note',
        id: row.id,
        summary: truncate(row.body.split('\n')[0]),
        status: null,
        created_at: row.created_at,
      });
    }
  }

  if (!type || type === 'relationship') {
    const rels = await query(
      `SELECT r.id, r.type, r.from_id, r.from_type, r.to_id, r.to_type, r.created_at
       FROM relationship r
       INNER JOIN cluster_member cm ON cm.primitive_id = r.id AND cm.primitive_type = 'relationship'
       WHERE cm.cluster_id = $1
       ORDER BY r.created_at DESC LIMIT $2`,
      [clusterId, limit],
    );
    for (const row of rels.rows) {
      items.push({
        type: 'relationship',
        id: row.id,
        summary: `${row.type} ${truncate(row.from_id, 8)} → ${truncate(row.to_id, 8)}`,
        status: null,
        subtype: row.type,
        from_id: row.from_id,
        from_type: row.from_type,
        to_id: row.to_id,
        to_type: row.to_type,
        created_at: row.created_at,
      });
    }
  }

  if (!type || type === 'assertion') {
    const rows = await query(
      `SELECT a.id, a.predicate, a.status, a.created_at
       FROM assertion a
       INNER JOIN cluster_member cm ON cm.primitive_id = a.id AND cm.primitive_type = 'assertion'
       WHERE cm.cluster_id = $1
       ORDER BY a.created_at DESC LIMIT $2`,
      [clusterId, limit],
    );
    for (const row of rows.rows) {
      items.push({
        type: 'assertion',
        id: row.id,
        summary: row.predicate,
        status: row.status,
        created_at: row.created_at,
      });
    }
  }

  if (!type || type === 'task') {
    const rows = await query(
      `SELECT t.id, t.intent, t.type, t.status, t.created_at
       FROM task t
       INNER JOIN cluster_member cm ON cm.primitive_id = t.id AND cm.primitive_type = 'task'
       WHERE cm.cluster_id = $1
       ORDER BY t.created_at DESC LIMIT $2`,
      [clusterId, limit],
    );
    for (const row of rows.rows) {
      items.push({
        type: 'task',
        id: row.id,
        summary: truncate(row.intent, 60),
        status: row.status,
        subtype: row.type,
        created_at: row.created_at,
      });
    }
  }

  if (!type || type === 'cluster') {
    const children = await query(
      `SELECT * FROM cluster WHERE parent_cluster_id = $1 AND status != 'archived'
       ORDER BY created_at DESC LIMIT $2`,
      [clusterId, limit],
    );
    for (const c of children.rows) {
      items.push({
        type: 'cluster',
        id: c.id,
        summary: c.name,
        status: c.status,
        created_at: c.created_at,
      });
    }
  }

  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { items: items.slice(0, limit) };
}

export async function listWorkspacePrimitives({ type, limit = 500 } = {}) {
  const capped = Math.min(Math.max(1, Number(limit) || 500), 1000);
  const items = [];

  if (!type || type === 'artifact') {
    const arts = await query(
      `${WORKSPACE_CLUSTER_SCOPE_CTE},
       scoped AS (
         SELECT DISTINCT ON (cs.project_id, a.id)
           cs.project_id, cs.project_name, cs.project_archived, cs.project_order,
           a.id, a.type, a.uri, a.content_hash, a.retrieved_at AS created_at, a.metadata
         FROM artifact a
         INNER JOIN cluster_member cm ON cm.primitive_id = a.id AND cm.primitive_type = 'artifact'
         INNER JOIN cluster_scope cs ON cs.id = cm.cluster_id
         ORDER BY cs.project_id, a.id, cm.added_at DESC
       )
       SELECT * FROM scoped ORDER BY project_order ASC, created_at DESC LIMIT $1`,
      [capped],
    );
    for (const row of arts.rows) {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      items.push({
        type: 'artifact',
        id: row.id,
        summary: `${row.type}: ${meta?.filename || truncate(row.uri)}`,
        status: row.type,
        created_at: row.created_at,
        project_id: row.project_id,
        project_name: row.project_name,
        project_archived: row.project_archived,
        project_order: Number(row.project_order ?? 0),
      });
    }
  }

  if (!type || type === 'note') {
    const notes = await query(
      `${WORKSPACE_CLUSTER_SCOPE_CTE},
       scoped AS (
         SELECT DISTINCT ON (cs.project_id, n.id)
           cs.project_id, cs.project_name, cs.project_archived, cs.project_order,
           n.id, n.body, n.created_at
         FROM note n
         INNER JOIN cluster_member cm ON cm.primitive_id = n.id AND cm.primitive_type = 'note'
         INNER JOIN cluster_scope cs ON cs.id = cm.cluster_id
         ORDER BY cs.project_id, n.id, cm.added_at DESC
       )
       SELECT * FROM scoped ORDER BY project_order ASC, created_at DESC LIMIT $1`,
      [capped],
    );
    for (const row of notes.rows) {
      items.push({
        type: 'note',
        id: row.id,
        summary: truncate(row.body.split('\n')[0]),
        status: null,
        created_at: row.created_at,
        project_id: row.project_id,
        project_name: row.project_name,
        project_archived: row.project_archived,
        project_order: Number(row.project_order ?? 0),
      });
    }
  }

  if (!type || type === 'relationship') {
    const rels = await query(
      `${WORKSPACE_CLUSTER_SCOPE_CTE},
       scoped AS (
         SELECT DISTINCT ON (cs.project_id, r.id)
           cs.project_id, cs.project_name, cs.project_archived, cs.project_order,
           r.id, r.type, r.from_id, r.from_type, r.to_id, r.to_type, r.created_at
         FROM relationship r
         INNER JOIN cluster_member cm ON cm.primitive_id = r.id AND cm.primitive_type = 'relationship'
         INNER JOIN cluster_scope cs ON cs.id = cm.cluster_id
         ORDER BY cs.project_id, r.id, cm.added_at DESC
       )
       SELECT * FROM scoped ORDER BY project_order ASC, created_at DESC LIMIT $1`,
      [capped],
    );
    for (const row of rels.rows) {
      items.push({
        type: 'relationship',
        id: row.id,
        summary: `${row.type} ${truncate(row.from_id, 8)} → ${truncate(row.to_id, 8)}`,
        status: null,
        subtype: row.type,
        from_id: row.from_id,
        from_type: row.from_type,
        to_id: row.to_id,
        to_type: row.to_type,
        created_at: row.created_at,
        project_id: row.project_id,
        project_name: row.project_name,
        project_archived: row.project_archived,
        project_order: Number(row.project_order ?? 0),
      });
    }
  }

  if (!type || type === 'assertion') {
    const rows = await query(
      `${WORKSPACE_CLUSTER_SCOPE_CTE},
       scoped AS (
         SELECT DISTINCT ON (cs.project_id, a.id)
           cs.project_id, cs.project_name, cs.project_archived, cs.project_order,
           a.id, a.predicate, a.status, a.created_at
         FROM assertion a
         INNER JOIN cluster_member cm ON cm.primitive_id = a.id AND cm.primitive_type = 'assertion'
         INNER JOIN cluster_scope cs ON cs.id = cm.cluster_id
         ORDER BY cs.project_id, a.id, cm.added_at DESC
       )
       SELECT * FROM scoped ORDER BY project_order ASC, created_at DESC LIMIT $1`,
      [capped],
    );
    for (const row of rows.rows) {
      items.push({
        type: 'assertion',
        id: row.id,
        summary: row.predicate,
        status: row.status,
        created_at: row.created_at,
        project_id: row.project_id,
        project_name: row.project_name,
        project_archived: row.project_archived,
        project_order: Number(row.project_order ?? 0),
      });
    }
  }

  if (!type || type === 'task') {
    const rows = await query(
      `${WORKSPACE_CLUSTER_SCOPE_CTE},
       scoped AS (
         SELECT DISTINCT ON (cs.project_id, t.id)
           cs.project_id, cs.project_name, cs.project_archived, cs.project_order,
           t.id, t.intent, t.type, t.status, t.created_at
         FROM task t
         INNER JOIN cluster_member cm ON cm.primitive_id = t.id AND cm.primitive_type = 'task'
         INNER JOIN cluster_scope cs ON cs.id = cm.cluster_id
         ORDER BY cs.project_id, t.id, cm.added_at DESC
       )
       SELECT * FROM scoped ORDER BY project_order ASC, created_at DESC LIMIT $1`,
      [capped],
    );
    for (const row of rows.rows) {
      items.push({
        type: 'task',
        id: row.id,
        summary: truncate(row.intent, 60),
        status: row.status,
        subtype: row.type,
        created_at: row.created_at,
        project_id: row.project_id,
        project_name: row.project_name,
        project_archived: row.project_archived,
        project_order: Number(row.project_order ?? 0),
      });
    }
  }

  if (!type || type === 'cluster') {
    const children = await query(
      `${WORKSPACE_CLUSTER_ITEM_SCOPE_CTE},
       scoped AS (
         SELECT DISTINCT ON (project_id, id)
           project_id, project_name, project_archived, project_order,
           id, name, status, created_at
         FROM cluster_scope
         ORDER BY project_id, id, created_at DESC
       )
       SELECT * FROM scoped ORDER BY project_order ASC, created_at DESC LIMIT $1`,
      [capped],
    );
    for (const c of children.rows) {
      items.push({
        type: 'cluster',
        id: c.id,
        summary: c.name,
        status: c.status,
        created_at: c.created_at,
        project_id: c.project_id,
        project_name: c.project_name,
        project_archived: c.project_archived,
        project_order: Number(c.project_order ?? 0),
      });
    }
  }

  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { items: items.slice(0, capped) };
}

export async function getPrimitiveDetail(type, id) {
  if (type === 'artifact') {
    const res = await query('SELECT * FROM artifact WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return null;
    const { getRelationshipsForPrimitive } = await import('./relationships.js');
    const edges = await getRelationshipsForPrimitive(id, 'artifact');
    const prov = await query(
      `SELECT source_id, source_type, position FROM provenance
       WHERE primitive_id = $1 AND primitive_type = 'artifact' ORDER BY position`,
      [id],
    );
    return {
      type: 'artifact',
      primitive: row,
      edges,
      provenance: prov.rows,
      author_chain: [],
    };
  }

  if (type === 'note') {
    const res = await query('SELECT * FROM note WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return null;
    const { getRelationshipsForPrimitive } = await import('./relationships.js');
    const edges = await getRelationshipsForPrimitive(id, 'note');
    return {
      type: 'note',
      primitive: {
        ...row,
        target_ref: { id: row.target_id, type: row.target_type },
        author_chain:
          typeof row.author_chain === 'string'
            ? JSON.parse(row.author_chain)
            : row.author_chain,
      },
      edges,
      provenance: [],
      author_chain:
        typeof row.author_chain === 'string'
          ? JSON.parse(row.author_chain)
          : row.author_chain,
    };
  }

  if (type === 'assertion') {
    const res = await query('SELECT * FROM assertion WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return null;
    const { getRelationshipsForPrimitive } = await import('./relationships.js');
    const edges = await getRelationshipsForPrimitive(id, 'assertion');
    const prov = await query(
      `SELECT source_id, source_type, position FROM provenance
       WHERE primitive_id = $1 AND primitive_type = 'assertion' ORDER BY position`,
      [id],
    );
    return {
      type: 'assertion',
      primitive: {
        ...row,
        subject_ref: { id: row.subject_id, type: row.subject_type },
        object_ref: row.object_id ? { id: row.object_id, type: row.object_type } : null,
        confidence: typeof row.confidence === 'string' ? JSON.parse(row.confidence) : row.confidence,
        scope: typeof row.scope === 'string' ? JSON.parse(row.scope) : row.scope,
        author_chain: typeof row.author_chain === 'string' ? JSON.parse(row.author_chain) : row.author_chain,
      },
      edges,
      provenance: prov.rows.map((p) => ({ id: p.source_id, type: p.source_type })),
      author_chain: typeof row.author_chain === 'string' ? JSON.parse(row.author_chain) : row.author_chain,
    };
  }

  if (type === 'task') {
    const res = await query('SELECT * FROM task WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return null;
    const io = await query('SELECT * FROM task_io WHERE task_id = $1', [id]);
    return {
      type: 'task',
      primitive: {
        ...row,
        inputs: io.rows.filter((r) => r.role === 'input').map((r) => ({ id: r.primitive_id, type: r.primitive_type })),
        outputs: io.rows.filter((r) => r.role === 'output').map((r) => ({ id: r.primitive_id, type: r.primitive_type })),
      },
      edges: [],
      provenance: [],
      author_chain: [],
    };
  }

  if (type === 'cluster') {
    const res = await query('SELECT * FROM cluster WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return null;
    const { getClusterMembers } = await import('./clusters.js');
    const members = await getClusterMembers(id);
    return {
      type: 'cluster',
      primitive: row,
      members,
      edges: [],
      provenance: [],
      author_chain: [],
    };
  }

  if (type === 'relationship') {
    const res = await query('SELECT * FROM relationship WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return null;
    const prov = await query(
      `SELECT source_id, source_type, position FROM provenance
       WHERE primitive_id = $1 AND primitive_type = 'relationship' ORDER BY position`,
      [id],
    );
    return {
      type: 'relationship',
      primitive: {
        ...row,
        from_ref: { id: row.from_id, type: row.from_type },
        to_ref: { id: row.to_id, type: row.to_type },
      },
      edges: [],
      provenance: prov.rows.map((p) => ({ id: p.source_id, type: p.source_type })),
      author_chain: [],
    };
  }

  return null;
}
