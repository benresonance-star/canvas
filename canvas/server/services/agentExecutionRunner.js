import { createHash } from 'node:crypto';
import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { getArtifactById } from '../repositories/artifacts.js';
import { getAgentArtifact } from '../repositories/agent-artifacts.js';
import { getDecryptedApiKey } from '../repositories/agent-credentials.js';
import {
  completeExecution,
  createExecution,
  createGeneratedImageArtifacts,
  failExecution,
  getExecution,
} from '../repositories/executions.js';
import { publishProjectSync } from '../lib/projectSyncHub.js';
import { createAgentPrompt, runImageTransformer } from './imageTransformer.js';

const TRANSFORMER_ID = 'transformer_image_generation';

function slugify(value) {
  return String(value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'agent';
}

function timestampForFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

function filePathFor({ projectSlug, agentSlug, executionNumber, version, ext }) {
  const filename = `${timestampForFilename()}_${agentSlug}_exec-${String(executionNumber).padStart(4, '0')}_v${String(version).padStart(2, '0')}.${ext}`;
  return {
    filename,
    filePath: `projects/${projectSlug}/generated/${agentSlug}/${filename}`,
  };
}

function contentHash(text) {
  return createHash('sha256').update(String(text ?? '')).digest('hex');
}

function normalizeReferenceImages(inputImages, referenceArtifactIds) {
  if (!Array.isArray(inputImages) || !inputImages.length) return new Map();
  const allowed = new Set(referenceArtifactIds);
  const byArtifactId = new Map();
  for (const image of inputImages) {
    const artifactId = String(image?.artifactId || '').trim();
    const dataUrl = String(image?.dataUrl || '').trim();
    if (!artifactId || !allowed.has(artifactId)) continue;
    if (!dataUrl.startsWith('data:image/')) continue;
    byArtifactId.set(artifactId, {
      dataUrl,
      filename: image?.filename ?? null,
    });
  }
  return byArtifactId;
}

function applyTransientReferenceImages(references, transientImages) {
  if (!transientImages.size) return references;
  return references.map((artifact) => {
    const transient = transientImages.get(artifact.id);
    if (!transient) return artifact;
    return {
      ...artifact,
      payload_text: transient.dataUrl,
      metadata: {
        ...(artifact.metadata ?? {}),
        dataUrl: transient.dataUrl,
        transientReferenceFilename: transient.filename,
      },
    };
  });
}

async function relate(from, type, to, metadata = {}) {
  const existing = await query(
    `SELECT id FROM relationship
     WHERE from_id = $1 AND from_type = $2 AND to_id = $3 AND to_type = $4 AND type = $5
     LIMIT 1`,
    [from.id, from.type, to.id, to.type, type],
  );
  if (existing.rows[0]) return;
  await query(
    `INSERT INTO relationship (id, from_id, from_type, to_id, to_type, type, confidence, bidirectional, created_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,NULL,FALSE,NOW(),$7)`,
    [
      newUlid(),
      from.id,
      from.type,
      to.id,
      to.type,
      type,
      JSON.stringify(metadata),
    ],
  );
}

export async function executeAgent(agentId, input = {}) {
  const agent = await getAgentArtifact(agentId);
  if (!agent || agent.archivedAt) {
    const error = new Error('Agent artifact not found');
    error.status = 404;
    throw error;
  }
  const promptArtifact = await getArtifactById(input.promptNoteArtifactId);
  if (!promptArtifact) {
    const error = new Error('Prompt note artifact not found');
    error.status = 400;
    throw error;
  }

  const referenceArtifactIds = Array.isArray(input.referenceArtifactIds)
    ? input.referenceArtifactIds.filter(Boolean)
    : [];
  const references = [];
  for (const id of referenceArtifactIds) {
    const artifact = await getArtifactById(id);
    if (artifact) references.push(artifact);
  }
  const transientReferenceImages = normalizeReferenceImages(
    input.referenceImages,
    referenceArtifactIds,
  );
  const transformerReferences = applyTransientReferenceImages(
    references,
    transientReferenceImages,
  );

  const originalPromptSnapshot = promptArtifact.payload_text
    || promptArtifact.metadata?.body
    || promptArtifact.uri
    || '';
  const agentPromptSnapshot = createAgentPrompt({
    prompt: originalPromptSnapshot,
    goal: agent.goal,
    instructions: agent.instructions,
  });
  const settings = {
    ...(agent.transformerSettings ?? {}),
    ...(input.settings ?? {}),
  };

  const execution = await createExecution({
    projectId: agent.projectId,
    agentArtifactId: agent.id,
    agentTypeId: agent.agentTypeId,
    transformerId: TRANSFORMER_ID,
    inputs: {
      promptNoteArtifactId: input.promptNoteArtifactId,
      referenceArtifactIds,
      settings,
    },
    originalPromptSnapshot,
    agentPromptSnapshot,
  });

  publishProjectSync(agent.projectId, 'execution.started', {
    executionId: execution.id,
    agentArtifactId: agent.id,
    status: execution.status,
  });

  try {
    await relate(
      { id: promptArtifact.id, type: 'artifact' },
      'prompt_input_to',
      { id: agent.id, type: 'artifact' },
      { executionId: execution.id },
    );
    for (const reference of references) {
      await relate(
        { id: reference.id, type: 'artifact' },
        'reference_input_to',
        { id: agent.id, type: 'artifact' },
        { executionId: execution.id },
      );
    }
    await relate(
      { id: agent.id, type: 'artifact' },
      'uses_tool',
      { id: 'tool_image_transformer', type: 'tool' },
      { executionId: execution.id },
    );

    const transformed = await runImageTransformer({
      prompt: agentPromptSnapshot,
      referenceArtifactIds,
      references: transformerReferences,
      provider: settings.provider || 'local',
      model: settings.model,
      settings,
      apiKey:
        settings.provider === 'openai'
          ? await getDecryptedApiKey('openai')
          : null,
    });

    const projectSlug = slugify(agent.projectId);
    const agentSlug = slugify(agent.name);
    const images = transformed.images.map((image) => ({
      ...image,
      ...filePathFor({
        projectSlug,
        agentSlug,
        executionNumber: execution.executionNumber,
        version: image.version,
        ext: image.ext,
      }),
    }));

    const artifacts = await createGeneratedImageArtifacts({
      execution,
      images,
      metadata: {
        executionId: execution.id,
        agentArtifactId: agent.id,
        agentTypeId: agent.agentTypeId,
        transformerId: TRANSFORMER_ID,
        promptNoteArtifactId: promptArtifact.id,
        referenceArtifactIds,
        originalPromptSnapshot,
        agentPromptSnapshot,
        provider: transformed.provider,
        model: transformed.model,
        createdAt: new Date().toISOString(),
      },
    });

    for (const artifact of artifacts) {
      await relate(
        { id: artifact.id, type: 'artifact' },
        'output_of',
        { id: execution.id, type: 'execution' },
      );
      await relate(
        { id: artifact.id, type: 'artifact' },
        'generated_from',
        { id: promptArtifact.id, type: 'artifact' },
      );
      await relate(
        { id: artifact.id, type: 'artifact' },
        'created_by_agent',
        { id: agent.id, type: 'artifact' },
      );
      await relate(
        { id: artifact.id, type: 'artifact' },
        'created_by_transformer',
        { id: TRANSFORMER_ID, type: 'transformer' },
      );
    }

    const completed = await completeExecution(execution.id, {
      outputs: {
        artifacts: artifacts.map((artifact) => ({
          id: artifact.id,
          type: 'artifact',
          filename: artifact.metadata.filename,
          filePath: artifact.metadata.filePath,
          contentHash: artifact.content_hash,
          dataUrl: artifact.payload_text,
        })),
      },
      logs: [{
        level: 'info',
        message: `Generated ${artifacts.length} image artifact${artifacts.length === 1 ? '' : 's'}`,
        at: new Date().toISOString(),
        promptHash: contentHash(agentPromptSnapshot),
        provider: transformed.provider,
        model: transformed.model,
        usage: transformed.usage ?? null,
      }],
    });

    publishProjectSync(agent.projectId, 'artifact.created', {
      executionId: execution.id,
      artifacts: artifacts.map((artifact) => ({ id: artifact.id, type: 'image' })),
    });
    publishProjectSync(agent.projectId, 'execution.completed', {
      executionId: execution.id,
      agentArtifactId: agent.id,
      status: completed.status,
    });

    return completed;
  } catch (error) {
    const failed = await failExecution(execution.id, error);
    publishProjectSync(agent.projectId, 'execution.failed', {
      executionId: execution.id,
      agentArtifactId: agent.id,
      error: failed.error,
    });
    throw error;
  }
}

export async function fetchExecution(id) {
  return getExecution(id);
}
