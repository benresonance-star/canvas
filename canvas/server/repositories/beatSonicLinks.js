import { pool } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import {
  applyBeatSonicLinksToState,
  extractBeatSonicLinksFromState,
} from '../../src/features/music/agents/beat/domain/beatSonicLinks.js';

function mapLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    trackId: row.track_id,
    sonicCardId: row.sonic_card_id,
    sonicStudioId: row.sonic_studio_id,
    voiceId: row.voice_id,
    stateHash: row.state_hash,
    renderedAssetId: row.rendered_asset_id,
    soundSource: row.sound_source,
    sonicVoice: row.sonic_voice,
    relationshipId: row.relationship_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBeatSonicLinks(agentId) {
  const res = await pool.query(
    `SELECT *
     FROM music_beat_sonic_link
     WHERE agent_id = $1 AND deleted_at IS NULL
     ORDER BY track_id ASC`,
    [agentId],
  );
  return res.rows.map(mapLink);
}

export async function listBeatSonicLinksForProject(projectId) {
  const res = await pool.query(
    `SELECT *
     FROM music_beat_sonic_link
     WHERE project_id = $1 AND deleted_at IS NULL
     ORDER BY agent_id ASC, track_id ASC`,
    [projectId],
  );
  return res.rows.map(mapLink);
}

export async function syncBeatSonicLinksForAgent(projectId, agentId, state) {
  const incoming = extractBeatSonicLinksFromState(state, { agentId, projectId });
  const incomingTrackIds = new Set(incoming.map((link) => link.trackId));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingRes = await client.query(
      `SELECT id, track_id
       FROM music_beat_sonic_link
       WHERE agent_id = $1 AND deleted_at IS NULL`,
      [agentId],
    );

    for (const row of existingRes.rows) {
      if (!incomingTrackIds.has(row.track_id)) {
        await client.query(
          `UPDATE music_beat_sonic_link
           SET deleted_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [row.id],
        );
      }
    }

    for (const link of incoming) {
      const existing = await client.query(
        `SELECT id
         FROM music_beat_sonic_link
         WHERE agent_id = $1 AND track_id = $2 AND deleted_at IS NULL`,
        [agentId, link.trackId],
      );
      if (existing.rows[0]?.id) {
        await client.query(
          `UPDATE music_beat_sonic_link
           SET sonic_card_id = $2,
               sonic_studio_id = $3,
               voice_id = $4,
               state_hash = $5,
               rendered_asset_id = $6,
               sound_source = $7,
               sonic_voice = $8::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [
            existing.rows[0].id,
            link.sonicCardId,
            link.sonicStudioId,
            link.voiceId,
            link.stateHash,
            link.renderedAssetId,
            link.soundSource,
            JSON.stringify(link.sonicVoice),
          ],
        );
      } else {
        await client.query(
          `INSERT INTO music_beat_sonic_link
           (id, project_id, agent_id, track_id, sonic_card_id, sonic_studio_id, voice_id,
            state_hash, rendered_asset_id, sound_source, sonic_voice)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
          [
            newUlid(),
            projectId,
            agentId,
            link.trackId,
            link.sonicCardId,
            link.sonicStudioId,
            link.voiceId,
            link.stateHash,
            link.renderedAssetId,
            link.soundSource,
            JSON.stringify(link.sonicVoice),
          ],
        );
      }
    }

    await client.query('COMMIT');
    return listBeatSonicLinks(agentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function enrichAgentStateWithSonicLinks(agent) {
  if (!agent?.id || !agent?.state) return agent;
  const links = await listBeatSonicLinks(agent.id);
  if (!links.length) return { ...agent, sonicLinks: [] };
  return {
    ...agent,
    sonicLinks: links,
    state: applyBeatSonicLinksToState(agent.state, links),
  };
}
