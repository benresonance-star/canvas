import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/clusters.js', () => ({ getOrCreateClusterForProject: vi.fn() }));
vi.mock('../../repositories/artifacts.js', () => ({
  getArtifactById: vi.fn(),
  listArtifactRelationships: vi.fn(),
  listArtifactsByProject: vi.fn(),
  upsertArtifactByHash: vi.fn(),
}));
vi.mock('../../repositories/artifact-events.js', () => ({
  appendArtifactEvent: vi.fn(),
  listEventsForArtifact: vi.fn(),
}));
vi.mock('../../services/artifactService.js', () => ({
  archiveArtifactWithEvents: vi.fn(),
  createArtifactWithEvents: vi.fn(),
  transitionArtifactStateWithEvents: vi.fn(),
  updateArtifactWithEvents: vi.fn(),
}));
vi.mock('../../repositories/relationships.js', () => ({
  createArtifactRelationship: vi.fn(),
  deleteRelationship: vi.fn(),
  getRelationshipById: vi.fn(),
  insertRelationship: vi.fn(),
  insertRelationshipIfAbsent: vi.fn(),
}));
vi.mock('../../repositories/graph.js', () => ({ getArtifactEdges: vi.fn() }));
vi.mock('../../repositories/notes.js', () => ({
  deleteNote: vi.fn(),
  insertNote: vi.fn(),
  listNotesForTarget: vi.fn(),
}));
vi.mock('../../repositories/assertions.js', () => ({
  defaultConfidence: vi.fn(),
  defaultScope: vi.fn(),
  insertAssertion: vi.fn(),
  listAssertionsForSubject: vi.fn(),
}));
vi.mock('../../repositories/tasks.js', () => ({ insertTask: vi.fn() }));
vi.mock('../../services/urlPreview.js', () => ({
  fetchBookmarkEmbedHtml: vi.fn(),
  fetchBookmarkPreview: vi.fn(),
}));

const artifactRepo = await import('../../repositories/artifacts.js');
const events = await import('../../repositories/artifact-events.js');
const relationships = await import('../../repositories/relationships.js');
const service = await import('../../services/artifactService.js');
const { registerArtifactRoutes } = await import('../artifacts.js');

function app() {
  const value = express();
  value.use(express.json());
  registerArtifactRoutes(value);
  return value;
}

function listen(value) {
  return new Promise((resolve) => {
    const server = value.listen(0, () => resolve(server));
  });
}

async function request(server, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { response, body: await response.json() };
}

describe('artifact base routes', () => {
  let server;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await listen(app());
  });

  afterEach(async () => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  it('creates a base artifact through the service layer', async () => {
    service.createArtifactWithEvents.mockResolvedValue({
      id: 'artifact-1',
      type: 'user_note',
      title: 'Note',
    });

    const result = await request(server, '/artifacts', {
      method: 'POST',
      body: JSON.stringify({ type: 'user_note', title: 'Note', projectId: 'project-1' }),
    });

    expect(result.response.status).toBe(201);
    expect(service.createArtifactWithEvents).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user_note', title: 'Note' }),
    );
    expect(result.body.artifact.id).toBe('artifact-1');
  });

  it('lists project artifacts excluding archived rows by default', async () => {
    artifactRepo.listArtifactsByProject.mockResolvedValue([{ id: 'artifact-1' }]);

    const result = await request(server, '/projects/project-1/artifacts');

    expect(result.response.status).toBe(200);
    expect(artifactRepo.listArtifactsByProject).toHaveBeenCalledWith('project-1', {
      includeArchived: false,
      limit: undefined,
    });
    expect(result.body.artifacts).toEqual([{ id: 'artifact-1' }]);
  });

  it('validates state transition requests', async () => {
    const result = await request(server, '/artifacts/artifact-1/transition', {
      method: 'POST',
      body: JSON.stringify({ toStateId: 'approved', actorId: 'ben' }),
    });

    expect(result.response.status).toBe(400);
    expect(service.transitionArtifactStateWithEvents).not.toHaveBeenCalled();
  });

  it('creates artifact relationships over the generic relationship table', async () => {
    relationships.createArtifactRelationship.mockResolvedValue({
      created: true,
      relationship: { id: 'rel-1' },
    });
    events.appendArtifactEvent.mockResolvedValue({ id: 'event-1' });

    const result = await request(server, '/artifact-relationships', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        sourceArtifactId: 'source-1',
        targetArtifactId: 'target-1',
        relationshipType: 'depends_on',
      }),
    });

    expect(result.response.status).toBe(201);
    expect(relationships.createArtifactRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipType: 'depends_on' }),
    );
    expect(events.appendArtifactEvent).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'source-1', type: 'RelationshipAdded' }),
    );
  });
});
