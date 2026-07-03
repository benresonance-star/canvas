import { z } from 'zod';

const actorTypeSchema = z.enum(['user', 'agent', 'system', 'function']);

export const createArtifactRequestSchema = z.object({
  projectId: z.string().min(1).optional().nullable(),
  type: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  uri: z.string().min(1).optional(),
  contentHash: z.string().min(1).optional(),
  content_hash: z.string().min(1).optional(),
  payloadText: z.string().optional().nullable(),
  payload_text: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  currentStateId: z.string().min(1).optional().nullable(),
  stateMachineId: z.string().min(1).optional().nullable(),
  createdBy: z.string().min(1).optional(),
  contentSchemaVersion: z.number().int().positive().optional().nullable(),
});

export const updateArtifactRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  content_hash: z.string().min(1).optional(),
  contentHash: z.string().min(1).optional(),
  payload_text: z.string().optional().nullable(),
  payloadText: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  currentStateId: z.string().min(1).optional().nullable(),
  stateMachineId: z.string().min(1).optional().nullable(),
  updatedBy: z.string().min(1).optional(),
  contentSchemaVersion: z.number().int().positive().optional().nullable(),
});

export const archiveArtifactRequestSchema = z.object({
  actorType: actorTypeSchema.optional(),
  actorId: z.string().min(1).optional(),
  reason: z.string().optional(),
});

export const transitionArtifactStateRequestSchema = z.object({
  toStateId: z.string().min(1),
  reason: z.string().optional(),
  actorType: actorTypeSchema,
  actorId: z.string().min(1),
  runId: z.string().min(1).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createStateMachineRequestSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  appliesToTypes: z.array(z.string().min(1)).optional(),
  states: z.array(z.record(z.string(), z.unknown())).optional(),
  transitions: z.array(z.record(z.string(), z.unknown())).optional(),
  createdBy: z.string().min(1).optional(),
});

export const createArtifactRelationshipRequestSchema = z.object({
  projectId: z.string().min(1).optional().nullable(),
  sourceArtifactId: z.string().min(1),
  targetArtifactId: z.string().min(1),
  relationshipType: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.string().min(1).optional(),
});

export const updateStateMachineRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  appliesToTypes: z.array(z.string().min(1)).optional(),
  states: z.array(z.record(z.string(), z.unknown())).optional(),
  transitions: z.array(z.record(z.string(), z.unknown())).optional(),
  updatedBy: z.string().min(1).optional(),
});

export function parseRequest(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const message = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ');
  const error = new Error(message);
  error.status = 400;
  throw error;
}
