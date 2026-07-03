import { query } from '../db.js';

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * @param {unknown} value
 * @returns {Record<string, { centerX: number, centerY: number }>}
 */
export function normalizeNodeOverrides(value) {
  if (!isPlainObject(value)) return {};
  /** @type {Record<string, { centerX: number, centerY: number }>} */
  const out = {};
  for (const [nodeId, entry] of Object.entries(value)) {
    if (typeof nodeId !== 'string' || !nodeId || !isPlainObject(entry)) continue;
    const centerX = Number(entry.centerX);
    const centerY = Number(entry.centerY);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) continue;
    out[nodeId] = { centerX, centerY };
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {Record<string, { x: number, y: number }>}
 */
export function normalizeEdgeAnchors(value) {
  if (!isPlainObject(value)) return {};
  /** @type {Record<string, { x: number, y: number }>} */
  const out = {};
  for (const [edgeId, entry] of Object.entries(value)) {
    if (typeof edgeId !== 'string' || !edgeId || !isPlainObject(entry)) continue;
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[edgeId] = { x, y };
  }
  return out;
}

/**
 * @param {import('pg').QueryResultRow} row
 */
function rowToLayout(row) {
  return {
    actionId: row.action_id,
    specVersion: row.spec_version,
    nodeOverrides: normalizeNodeOverrides(row.node_overrides),
    edgeAnchors: normalizeEdgeAnchors(row.edge_anchors),
    updatedAt: row.updated_at,
  };
}

/**
 * @param {string} specVersion
 */
export async function listConcentrateLayouts(specVersion) {
  const res = await query(
    `SELECT action_id, spec_version, node_overrides, edge_anchors, updated_at
     FROM diagnostics_concentrate_layout
     WHERE spec_version = $1
     ORDER BY action_id ASC`,
    [specVersion],
  );
  return res.rows.map(rowToLayout);
}

/**
 * @param {string} actionId
 * @param {string} specVersion
 */
export async function getConcentrateLayout(actionId, specVersion) {
  const res = await query(
    `SELECT action_id, spec_version, node_overrides, edge_anchors, updated_at
     FROM diagnostics_concentrate_layout
     WHERE action_id = $1 AND spec_version = $2`,
    [actionId, specVersion],
  );
  if (!res.rows[0]) return null;
  return rowToLayout(res.rows[0]);
}

/**
 * @param {string} actionId
 * @param {string} specVersion
 * @param {{ nodeOverrides?: unknown, edgeAnchors?: unknown }} body
 */
export async function putConcentrateLayout(actionId, specVersion, body) {
  const nodeOverrides = normalizeNodeOverrides(body?.nodeOverrides);
  const edgeAnchors = normalizeEdgeAnchors(body?.edgeAnchors);
  const now = new Date().toISOString();

  const res = await query(
    `INSERT INTO diagnostics_concentrate_layout
       (action_id, spec_version, node_overrides, edge_anchors, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     ON CONFLICT (action_id, spec_version)
     DO UPDATE SET
       node_overrides = EXCLUDED.node_overrides,
       edge_anchors = EXCLUDED.edge_anchors,
       updated_at = EXCLUDED.updated_at
     RETURNING action_id, spec_version, node_overrides, edge_anchors, updated_at`,
    [
      actionId,
      specVersion,
      JSON.stringify(nodeOverrides),
      JSON.stringify(edgeAnchors),
      now,
    ],
  );

  return rowToLayout(res.rows[0]);
}
