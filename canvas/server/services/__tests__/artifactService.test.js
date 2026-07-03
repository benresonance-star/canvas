import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock('../../db.js', () => ({
  pool: {
    connect: vi.fn(() => Promise.resolve(client)),
  },
}));

vi.mock('../../../src/primitives/shared/ulid.js', () => ({
  newUlid: vi.fn(() => '01KVARTIFACTEVENT0000000000'),
}));

vi.mock('../../repositories/artifacts.js', () => ({
  archiveArtifact: vi.fn(),
  createArtifact: vi.fn(),
  getBaseArtifactById: vi.fn(),
  updateArtifact: vi.fn(),
  updateArtifactState: vi.fn(),
}));

vi.mock('../../repositories/artifact-events.js', () => ({
  appendArtifactEvent: vi.fn(),
}));

vi.mock('../../repositories/state-machines.js', () => ({
  getStateMachineById: vi.fn(),
}));

const artifacts = await import('../../repositories/artifacts.js');
const events = await import('../../repositories/artifact-events.js');
const machines = await import('../../repositories/state-machines.js');
const service = await import('../artifactService.js');

const baseArtifact = {
  id: 'artifact-1',
  projectId: 'project-1',
  type: 'user_note',
  title: 'Note',
  currentStateId: 'draft',
  stateMachineId: 'machine-1',
  contentHash: 'hash-1',
};

describe('artifactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockResolvedValue({ rows: [] });
    client.release.mockReset();
    artifacts.getBaseArtifactById.mockResolvedValue(baseArtifact);
    artifacts.updateArtifactState.mockResolvedValue({ ...baseArtifact, currentStateId: 'under_review' });
    events.appendArtifactEvent.mockResolvedValue({ id: 'event-1', type: 'StateTransitioned' });
    machines.getStateMachineById.mockResolvedValue({
      id: 'machine-1',
      states: [
        { id: 'draft', kind: 'initial' },
        { id: 'under_review', kind: 'normal' },
      ],
      transitions: [
        { id: 'submit', fromStateId: 'draft', toStateId: 'under_review' },
      ],
    });
  });

  it('transitions artifact state and appends history atomically', async () => {
    const result = await service.transitionArtifactStateWithEvents('artifact-1', {
      toStateId: 'under_review',
      actorType: 'user',
      actorId: 'ben',
      reason: 'Ready',
    });

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(artifacts.updateArtifactState).toHaveBeenCalledWith(
      'artifact-1',
      'under_review',
      'ben',
      client,
    );
    expect(events.appendArtifactEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: 'artifact-1',
        type: 'StateTransitioned',
        payload: expect.objectContaining({
          fromStateId: 'draft',
          toStateId: 'under_review',
          reason: 'Ready',
        }),
      }),
      client,
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(result.artifact.currentStateId).toBe('under_review');
  });

  it('rejects invalid transitions and rolls back before mutation', async () => {
    await expect(service.transitionArtifactStateWithEvents('artifact-1', {
      toStateId: 'approved',
      actorType: 'user',
      actorId: 'ben',
    })).rejects.toThrow('Invalid state transition');

    expect(artifacts.updateArtifactState).not.toHaveBeenCalled();
    expect(events.appendArtifactEvent).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('creates an artifact and records creation events', async () => {
    artifacts.createArtifact.mockResolvedValue({
      ...baseArtifact,
      currentStateId: null,
      stateMachineId: null,
    });

    const result = await service.createArtifactWithEvents({
      projectId: 'project-1',
      type: 'user_note',
      title: 'Note',
      createdBy: 'ben',
    });

    expect(artifacts.createArtifact).toHaveBeenCalledWith(expect.any(Object), client);
    expect(events.appendArtifactEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ArtifactCreated', actorId: 'ben' }),
      client,
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(result.id).toBe('artifact-1');
  });
});
