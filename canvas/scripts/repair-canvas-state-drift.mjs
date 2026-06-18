import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const DELETE_ORPHANS = process.argv.includes('--delete-orphans');
const TARGET_ARG = process.argv.find((arg) => arg.startsWith('--project='));
const TARGET_PROJECT_ID = TARGET_ARG ? TARGET_ARG.slice('--project='.length) : null;

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://canvas:canvas@localhost:5432/canvas',
});

function canonicalKeyForEntry(entry) {
  if (!entry) return '';
  if (typeof entry.key === 'string' && entry.key) return entry.key;
  const version = Array.isArray(entry.versions) ? entry.versions[0] : null;
  return version?.artifactRef?.id
    || version?.filename
    || entry.name
    || entry.id
    || entry.stagingId
    || '';
}

function entryMap(entries) {
  const byKey = new Map();
  for (const entry of entries ?? []) {
    if (entry?.syncKey) byKey.set(`sync:${entry.syncKey}`, entry);
    if (entry?.cardId) byKey.set(`card:${entry.cardId}`, entry);
    if (entry?.stagingId) byKey.set(`staging:${entry.stagingId}`, entry);
  }
  return byKey;
}

function lookupLayoutEntry(map, entry) {
  const syncKey = canonicalKeyForEntry(entry);
  if (syncKey && map.has(`sync:${syncKey}`)) return map.get(`sync:${syncKey}`);
  if (entry?.id && map.has(`card:${entry.id}`)) return map.get(`card:${entry.id}`);
  if (entry?.stagingId && map.has(`staging:${entry.stagingId}`)) {
    return map.get(`staging:${entry.stagingId}`);
  }
  return null;
}

function cardGeometry(card) {
  return {
    x: card?.x ?? 0,
    y: card?.y ?? 0,
    w: card?.width ?? null,
    h: card?.height ?? null,
  };
}

function placedGeometry(placed) {
  return {
    x: placed?.x ?? 0,
    y: placed?.y ?? 0,
    w: placed?.w ?? null,
    h: placed?.h ?? null,
  };
}

function sameJson(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function comparablePlacementMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
  return Object.fromEntries(
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [
        key,
        {
          surface: entry?.surface ?? null,
          placement: entry?.placement ?? entry?.record ?? null,
        },
      ]),
  );
}

function specDrift(payload, spec) {
  const placedByKey = entryMap(spec?.layout?.placed);
  const stagingByKey = entryMap(spec?.layout?.staging);
  const diffs = [];
  const matchedPlaced = new Set();
  const matchedStaging = new Set();

  for (const card of payload?.cards ?? []) {
    const key = canonicalKeyForEntry(card) || card.id;
    const placed = lookupLayoutEntry(placedByKey, card);
    if (!placed) {
      diffs.push({ key, field: 'surface', document: 'canvas', spec: 'missing' });
      continue;
    }
    if (placed.syncKey) matchedPlaced.add(`sync:${placed.syncKey}`);
    if (placed.cardId) matchedPlaced.add(`card:${placed.cardId}`);
    const docGeom = cardGeometry(card);
    const specGeom = placedGeometry(placed);
    for (const field of ['x', 'y', 'w', 'h']) {
      if (docGeom[field] !== specGeom[field]) {
        diffs.push({ key, field, document: docGeom[field], spec: specGeom[field] });
      }
    }
  }

  for (const placed of spec?.layout?.placed ?? []) {
    const matched =
      (placed.syncKey && matchedPlaced.has(`sync:${placed.syncKey}`))
      || (placed.cardId && matchedPlaced.has(`card:${placed.cardId}`));
    if (!matched) {
      diffs.push({
        key: placed.syncKey || placed.cardId || placed.id,
        field: 'surface',
        document: 'missing',
        spec: 'canvas',
      });
    }
  }

  for (const staged of payload?.stagedSyncCards ?? []) {
    const key = canonicalKeyForEntry(staged) || staged.stagingId;
    const specStaged = lookupLayoutEntry(stagingByKey, staged);
    if (specStaged) {
      if (specStaged.syncKey) matchedStaging.add(`sync:${specStaged.syncKey}`);
      if (specStaged.stagingId) matchedStaging.add(`staging:${specStaged.stagingId}`);
    } else {
      diffs.push({ key, field: 'staging', document: true, spec: false });
    }
  }

  for (const staged of spec?.layout?.staging ?? []) {
    const matched =
      (staged.syncKey && matchedStaging.has(`sync:${staged.syncKey}`))
      || (staged.stagingId && matchedStaging.has(`staging:${staged.stagingId}`));
    if (!matched) {
      diffs.push({
        key: staged.syncKey || staged.stagingId || staged.id,
        field: 'staging',
        document: false,
        spec: true,
      });
    }
  }

  const docViewport = {
    x: payload?.canvasView?.x ?? 0,
    y: payload?.canvasView?.y ?? 0,
    zoom: payload?.canvasView?.zoom ?? 1,
  };
  const specViewport = {
    x: spec?.viewport?.x ?? 0,
    y: spec?.viewport?.y ?? 0,
    zoom: spec?.viewport?.zoom ?? 1,
  };
  for (const field of ['x', 'y', 'zoom']) {
    if (docViewport[field] !== specViewport[field]) {
      diffs.push({ key: 'viewport', field, document: docViewport[field], spec: specViewport[field] });
    }
  }

  if (
    !sameJson(
      comparablePlacementMap(payload?.artifactPlacements),
      comparablePlacementMap(spec?.layout?.artifactPlacements),
    )
  ) {
    diffs.push({ key: 'artifactPlacements', field: 'map', document: 'differs', spec: 'differs' });
  }

  return diffs;
}

function applySpecToPayload(payload, spec) {
  const layout = spec?.layout ?? {};
  const placedByKey = entryMap(layout.placed);
  const stagingByKey = entryMap(layout.staging);
  const nextCards = [];
  const nextStaged = [];
  const handled = new Set();

  for (const card of payload.cards ?? []) {
    const key = canonicalKeyForEntry(card);
    const placed = lookupLayoutEntry(placedByKey, card);
    if (placed) {
      nextCards.push({
        ...card,
        id: placed.cardId ?? card.id,
        x: placed.x ?? card.x ?? 0,
        y: placed.y ?? card.y ?? 0,
        width: placed.w ?? card.width,
        height: placed.h ?? card.height,
        clusterId: placed.cluster_id ?? card.clusterId,
      });
      handled.add(key);
      continue;
    }
    const stagedSpec = lookupLayoutEntry(stagingByKey, card);
    if (stagedSpec) {
      nextStaged.push({
        key: card.key,
        prefix: card.prefix,
        name: card.name,
        type: card.type,
        versions: card.versions ?? [],
        pinnedVersion: card.pinnedVersion,
        stagingId: stagedSpec.stagingId ?? card.stagingId,
      });
      handled.add(key);
      continue;
    }
    nextCards.push(card);
  }

  for (const staged of payload.stagedSyncCards ?? []) {
    const key = canonicalKeyForEntry(staged);
    if (key && handled.has(key)) continue;
    const placed = lookupLayoutEntry(placedByKey, staged);
    if (placed) {
      nextCards.push({
        id: placed.cardId ?? staged.id ?? staged.stagingId ?? key,
        key: staged.key,
        prefix: staged.prefix,
        name: staged.name,
        type: staged.type,
        versions: staged.versions ?? [],
        pinnedVersion: staged.pinnedVersion,
        x: placed.x ?? 0,
        y: placed.y ?? 0,
        width: placed.w ?? undefined,
        height: placed.h ?? undefined,
        ...(placed.cluster_id ? { clusterId: placed.cluster_id } : {}),
      });
      handled.add(key);
      continue;
    }
    const stagedSpec = lookupLayoutEntry(stagingByKey, staged);
    if (stagedSpec) {
      nextStaged.push({
        ...staged,
        stagingId: stagedSpec.stagingId ?? staged.stagingId,
      });
      handled.add(key);
      continue;
    }
    nextStaged.push(staged);
  }

  return {
    ...payload,
    cards: nextCards,
    stagedSyncCards: nextStaged,
    canvasView: spec.viewport
      ? {
          x: spec.viewport.x ?? payload.canvasView?.x ?? 0,
          y: spec.viewport.y ?? payload.canvasView?.y ?? 0,
          zoom: spec.viewport.zoom ?? payload.canvasView?.zoom ?? 1,
        }
      : payload.canvasView,
    artifactPlacements: layout.artifactPlacements ?? payload.artifactPlacements,
  };
}

function projectPayloadToSpec(payload) {
  return {
    layout: {
      placed: (payload?.cards ?? []).map((card) => ({
        kind: card.type === 'bookmark' ? 'url' : card.type === 'user_note' ? 'note' : 'resource',
        id: card.versions?.[0]?.artifactRef?.id ?? card.id,
        syncKey: canonicalKeyForEntry(card),
        cardId: card.id,
        x: card.x ?? 0,
        y: card.y ?? 0,
        w: card.width ?? null,
        h: card.height ?? null,
        type: card.type,
        cluster_id: card.clusterId ?? null,
      })),
      staging: (payload?.stagedSyncCards ?? []).map((staged) => ({
        kind: staged.type === 'bookmark' ? 'url' : staged.type === 'user_note' ? 'note' : 'resource',
        id: staged.stagingId,
        syncKey: canonicalKeyForEntry(staged),
        stagingId: staged.stagingId,
        type: staged.type,
      })),
      artifactPlacements: payload?.artifactPlacements ?? null,
    },
    viewport: {
      x: payload?.canvasView?.x ?? 0,
      y: payload?.canvasView?.y ?? 0,
      zoom: payload?.canvasView?.zoom ?? 1,
    },
  };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const indexRes = await client.query(
      'SELECT payload FROM canvas_workspace_index WHERE id = $1',
      ['default'],
    );
    const indexedIds = new Set((indexRes.rows[0]?.payload?.projects ?? []).map((p) => p.id));
    const projectNames = new Map(
      (indexRes.rows[0]?.payload?.projects ?? []).map((p) => [p.id, p.name]),
    );

    const rows = await client.query(
      `SELECT d.project_id,
              d.payload,
              d.revision AS document_revision,
              d.updated_at AS document_updated_at,
              s.layout,
              s.viewport,
              s.version AS spec_version,
              s.updated_at AS spec_updated_at
         FROM canvas_project_document d
         LEFT JOIN spec_canvas_state s ON s.project_id = d.project_id
        WHERE ($1::text IS NULL OR d.project_id = $1)
        ORDER BY d.updated_at DESC`,
      [TARGET_PROJECT_ID],
    );

    const repairs = [];
    for (const row of rows.rows) {
      if (!row.layout) continue;
      const spec = {
        layout: row.layout,
        viewport: row.viewport,
        version: row.spec_version,
        updatedAt: row.spec_updated_at,
      };
      const diffs = specDrift(row.payload, spec);
      if (!diffs.length) continue;

      const specNewer = new Date(row.spec_updated_at).getTime()
        > new Date(row.document_updated_at).getTime();
      repairs.push({
        projectId: row.project_id,
        name: projectNames.get(row.project_id) ?? '(not indexed)',
        direction: specNewer ? 'spec->document' : 'document->spec',
        diffCount: diffs.length,
        sample: diffs.slice(0, 5),
      });

      if (!APPLY) continue;
      if (specNewer) {
        const nextPayload = applySpecToPayload(row.payload, spec);
        await client.query(
          `UPDATE canvas_project_document
              SET payload = $2::jsonb,
                  revision = GREATEST(revision + 1, $3::integer),
                  updated_at = NOW()
            WHERE project_id = $1`,
          [row.project_id, JSON.stringify(nextPayload), Number(row.document_revision) + 1],
        );
      } else {
        const nextSpec = projectPayloadToSpec(row.payload);
        await client.query(
          `UPDATE spec_canvas_state
              SET layout = $2::jsonb,
                  viewport = $3::jsonb,
                  version = version + 1,
                  updated_at = NOW()
            WHERE project_id = $1`,
          [row.project_id, JSON.stringify(nextSpec.layout), JSON.stringify(nextSpec.viewport)],
        );
      }
    }

    const orphanDocs = rows.rows
      .filter((row) => !indexedIds.has(row.project_id))
      .map((row) => row.project_id);
    let deletedOrphans = 0;
    if (APPLY && DELETE_ORPHANS && !TARGET_PROJECT_ID && orphanDocs.length) {
      const deleteSpec = await client.query(
        'DELETE FROM spec_canvas_state WHERE project_id = ANY($1::text[])',
        [orphanDocs],
      );
      const deleteDocs = await client.query(
        'DELETE FROM canvas_project_document WHERE project_id = ANY($1::text[])',
        [orphanDocs],
      );
      deletedOrphans = deleteDocs.rowCount;
      console.log('Deleted orphan spec rows:', deleteSpec.rowCount);
    }

    if (APPLY) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    console.log(APPLY ? 'Applied repair.' : 'Dry run only.');
    console.log('Drift repairs:', repairs.length);
    for (const repair of repairs) {
      console.log(
        `- ${repair.projectId} | ${repair.name} | ${repair.direction} | diffs ${repair.diffCount}`,
      );
      for (const diff of repair.sample) {
        console.log(
          `  ${diff.key}.${diff.field}: document=${JSON.stringify(diff.document)} spec=${JSON.stringify(diff.spec)}`,
        );
      }
    }
    console.log('Orphan document rows:', orphanDocs.length);
    if (APPLY && DELETE_ORPHANS) {
      console.log('Deleted orphan document rows:', deletedOrphans);
    } else if (orphanDocs.length) {
      console.log('Use --apply --delete-orphans to remove orphan document/spec rows.');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
