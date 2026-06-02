import { z } from 'zod';

const canvasViewSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

export const projectPatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('setCanvasView'),
    view: canvasViewSchema,
  }),
  z.object({
    op: z.literal('setCardLayout'),
    id: z.string().min(1),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  z.object({
    op: z.literal('setPlacement'),
    key: z.string().min(1),
    surface: z.enum(['canvas', 'dock']),
    ref: z.record(z.unknown()).nullable().optional(),
  }),
  z.object({
    op: z.literal('upsertCard'),
    card: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal('removeCard'),
    id: z.string().min(1),
  }),
  z.object({
    op: z.literal('upsertStaged'),
    staged: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal('removeStaged'),
    stagingId: z.string().min(1),
  }),
  z.object({
    op: z.literal('setProjectName'),
    projectName: z.string(),
  }),
  z.object({
    op: z.literal('replaceDocument'),
    payload: z.record(z.unknown()),
  }),
]);

export const projectPatchOpsSchema = z
  .array(projectPatchOpSchema)
  .min(1)
  .max(32);

export const workspaceIndexSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      displayName: z.string().optional(),
      archived: z.boolean().optional(),
    }),
  ),
});

/**
 * @param {unknown} ops
 * @returns {{ ok: true, ops: import('zod').infer<typeof projectPatchOpsSchema> } | { ok: false, reason: string }}
 */
export function validatePatchOpsSchema(ops) {
  const result = projectPatchOpsSchema.safeParse(ops);
  if (result.success) return { ok: true, ops: result.data };
  const reason = result.error.issues.map((i) => i.message).join('; ');
  return { ok: false, reason: reason || 'invalid patch ops' };
}

/**
 * @param {unknown} index
 * @returns {{ ok: true, index: import('zod').infer<typeof workspaceIndexSchema> } | { ok: false, reason: string }}
 */
export function validateWorkspaceIndexSchema(index) {
  const result = workspaceIndexSchema.safeParse(index);
  if (result.success) return { ok: true, index: result.data };
  const reason = result.error.issues.map((i) => i.message).join('; ');
  return { ok: false, reason: reason || 'invalid workspace index' };
}
