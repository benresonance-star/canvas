import { pool } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import {
  archiveArtifact,
  createArtifact,
  getBaseArtifactById,
  restoreArtifact,
  updateArtifact,
  updateArtifactState,
} from '../repositories/artifacts.js';
import { appendArtifactEvent } from '../repositories/artifact-events.js';
import { getStateMachineById } from '../repositories/state-machines.js';
import {
  createArtifactRelationship,
  deleteRelationship,
  getRelationshipById,
} from '../repositories/relationships.js';

function eventPayloadForArtifact(artifact) {
  return {
    artifactType: artifact.type,
    title: artifact.title,
  };
}

function assertExpectedRevision(artifact, expectedRevision) {
  if (expectedRevision == null) return;
  if (Number(expectedRevision) !== Number(artifact.revision)) {
    const error = new Error('Artifact revision conflict');
    error.status = 409;
    error.currentRevision = artifact.revision;
    throw error;
  }
}

async function appendCanvasEvent(db, { actor, action, targetId, targetType, before, after }) {
  await db.query(
    `INSERT INTO canvas_event (id, occurred_at, actor, action, target_id, target_type, before, after)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)`,
    [
      newUlid(),
      JSON.stringify(actor),
      action,
      targetId,
      targetType,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}

function changedFieldsFromPatch(patch) {
  const fields = [];
  if (patch.title !== undefined) fields.push('title');
  if (patch.description !== undefined) fields.push('description');
  if (patch.contentHash !== undefined || patch.content_hash !== undefined) fields.push('content_hash');
  if (patch.payloadText !== undefined || patch.payload_text !== undefined) fields.push('payload_text');
  if (patch.metadata !== undefined) fields.push('metadata');
  if (patch.capabilities !== undefined) fields.push('capabilities');
  if (patch.currentStateId !== undefined || patch.current_state_id !== undefined) fields.push('current_state_id');
  if (patch.stateMachineId !== undefined || patch.state_machine_id !== undefined) fields.push('state_machine_id');
  if (patch.contentSchemaVersion !== undefined || patch.content_schema_version !== undefined) {
    fields.push('content_schema_version');
  }
  return fields;
}

function isInitialState(machine, stateId) {
  return (machine.states ?? []).some((state) => state.id === stateId && state.kind === 'initial');
}

function hasState(machine, stateId) {
  return (machine.states ?? []).some((state) => state.id === stateId);
}

function isValidTransition(machine, fromStateId, toStateId) {
  if (!hasState(machine, toStateId)) return false;
  if (!fromStateId) return isInitialState(machine, toStateId);
  return (machine.transitions ?? []).some(
    (transition) =>
      transition.fromStateId === fromStateId && transition.toStateId === toStateId,
  );
}

export async function createArtifactWithEvents(input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const artifact = await createArtifact(input, client);
    await appendArtifactEvent({
      artifactId: artifact.id,
      projectId: artifact.projectId,
      type: 'ArtifactCreated',
      payload: eventPayloadForArtifact(artifact),
      actorType: 'user',
      actorId: input.createdBy || 'user:local',
    }, client);
    await appendCanvasEvent(client, {
      actor: { kind: 'human', id: input.createdBy || 'user:local' },
      action: 'created',
      targetId: artifact.id,
      targetType: 'artifact',
      after: { id: artifact.id, type: artifact.type, title: artifact.title },
    });
    if (artifact.currentStateId) {
      await appendArtifactEvent({
        artifactId: artifact.id,
        projectId: artifact.projectId,
        type: 'StateTransitioned',
        payload: {
          fromStateId: null,
          toStateId: artifact.currentStateId,
          reason: 'Initial state',
        },
        actorType: 'system',
        actorId: 'system',
      }, client);
    }
    await client.query('COMMIT');
    return artifact;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateArtifactWithEvents(id, patch) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await getBaseArtifactById(id, client);
    if (!before) {
      const error = new Error('Artifact not found');
      error.status = 404;
      throw error;
    }
    assertExpectedRevision(before, patch.expectedRevision);
    const updatedBy = patch.updatedBy || patch.updated_by || 'user:local';
    const updated = await updateArtifact(id, { ...patch, updatedBy }, client);
    const changedFields = changedFieldsFromPatch(patch);
    if (changedFields.length) {
      await appendArtifactEvent({
        artifactId: id,
        projectId: updated.projectId,
        type: 'ContentUpdated',
        payload: {
          changedFields,
          summary: 'Updated artifact',
        },
        actorType: 'user',
        actorId: updatedBy,
      }, client);
      await appendCanvasEvent(client, {
        actor: { kind: 'human', id: updatedBy },
        action: 'updated',
        targetId: id,
        targetType: 'artifact',
        before: { content_hash: before.contentHash, title: before.title },
        after: { content_hash: updated.contentHash, title: updated.title },
      });
    }
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveArtifactWithEvents(id, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await getBaseArtifactById(id, client);
    if (!before) {
      const error = new Error('Artifact not found');
      error.status = 404;
      throw error;
    }
    const actorType = input.actorType || 'user';
    const actorId = input.actorId || 'user:local';
    assertExpectedRevision(before, input.expectedRevision);
    const artifact = input.expectedRevision == null
      ? await archiveArtifact(id, actorId, client)
      : await archiveArtifact(id, actorId, client, input.expectedRevision);
    await appendArtifactEvent({
      artifactId: id,
      projectId: artifact.projectId,
      type: 'ArtifactArchived',
      payload: { reason: input.reason ?? null },
      actorType,
      actorId,
    }, client);
    await appendCanvasEvent(client, {
      actor: { kind: actorType, id: actorId },
      action: 'archived',
      targetId: id,
      targetType: 'artifact',
      before: { archived_at: before.archivedAt },
      after: { archived_at: artifact.archivedAt },
    });
    await client.query('COMMIT');
    return artifact;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreArtifactWithEvents(id, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await getBaseArtifactById(id, client);
    if (!before) {
      const error = new Error('Artifact not found');
      error.status = 404;
      throw error;
    }
    assertExpectedRevision(before, input.expectedRevision);
    const actorType = input.actorType || 'user';
    const actorId = input.actorId || 'user:local';
    const artifact = await restoreArtifact(id, actorId, client, input.expectedRevision ?? null);
    await appendArtifactEvent({
      artifactId: id,
      projectId: artifact.projectId,
      type: 'ArtifactRestored',
      payload: { reason: input.reason ?? null },
      actorType,
      actorId,
    }, client);
    await appendCanvasEvent(client, {
      actor: { kind: actorType, id: actorId },
      action: 'restored',
      targetId: id,
      targetType: 'artifact',
      before: { archived_at: before.archivedAt },
      after: { archived_at: null },
    });
    await client.query('COMMIT');
    return artifact;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function transitionArtifactStateWithEvents(id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const artifact = await getBaseArtifactById(id, client);
    if (!artifact) {
      const error = new Error('Artifact not found');
      error.status = 404;
      throw error;
    }
    assertExpectedRevision(artifact, input.expectedRevision);
    if (artifact.stateMachineId) {
      const machine = await getStateMachineById(artifact.stateMachineId, client);
      if (!machine) throw new Error('State machine not found');
      if (!isValidTransition(machine, artifact.currentStateId, input.toStateId)) {
        const error = new Error('Invalid state transition');
        error.status = 400;
        throw error;
      }
    }
    const updated = input.expectedRevision == null
      ? await updateArtifactState(id, input.toStateId, input.actorId, client)
      : await updateArtifactState(
        id,
        input.toStateId,
        input.actorId,
        client,
        input.expectedRevision,
      );
    const event = await appendArtifactEvent({
      artifactId: id,
      projectId: artifact.projectId,
      type: 'StateTransitioned',
      payload: {
        fromStateId: artifact.currentStateId,
        toStateId: input.toStateId,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      },
      actorType: input.actorType,
      actorId: input.actorId,
      runId: input.runId ?? null,
    }, client);
    await appendCanvasEvent(client, {
      actor: { kind: input.actorType, id: input.actorId },
      action: 'state_transitioned',
      targetId: id,
      targetType: 'artifact',
      before: { current_state_id: artifact.currentStateId },
      after: { current_state_id: updated.currentStateId },
    });
    await client.query('COMMIT');
    return { artifact: updated, event };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addArtifactRelationshipWithEvents(input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await createArtifactRelationship(
      input,
      {},
      client,
      { emitCanvasEvent: false },
    );
    if (result.created) {
      await appendArtifactEvent({
        artifactId: input.sourceArtifactId,
        projectId: input.projectId ?? null,
        type: 'RelationshipAdded',
        payload: {
          relationshipId: result.relationship.id,
          sourceArtifactId: input.sourceArtifactId,
          targetArtifactId: input.targetArtifactId,
          relationshipType: input.relationshipType,
        },
        actorType: 'user',
        actorId: input.createdBy || 'user:local',
      }, client);
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeArtifactRelationshipWithEvents(id, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await getRelationshipById(id, client);
    if (!existing) {
      const error = new Error('Relationship not found');
      error.status = 404;
      throw error;
    }
    const deleted = await deleteRelationship(id, client);
    if (!deleted) {
      const error = new Error('Relationship not found');
      error.status = 404;
      throw error;
    }
    if (existing.from_ref?.type === 'artifact') {
      await appendArtifactEvent({
        artifactId: existing.from_ref.id,
        projectId: existing.project_id ?? null,
        type: 'RelationshipRemoved',
        payload: {
          relationshipId: id,
          sourceArtifactId: existing.from_ref.id,
          targetArtifactId: existing.to_ref?.id ?? null,
          relationshipType: existing.type,
        },
        actorType: 'user',
        actorId: input.actorId || 'user:local',
      }, client);
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
