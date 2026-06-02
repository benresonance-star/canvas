import { describe, it, expect } from 'vitest';
import {
  validatePatchOpsSchema,
  validateWorkspaceIndexSchema,
} from '../projectSyncSchemas.js';

describe('projectSyncSchemas', () => {
  it('accepts valid setCanvasView op', () => {
    const result = validatePatchOpsSchema([
      { op: 'setCanvasView', view: { x: 0, y: 0, zoom: 1 } },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects empty ops array', () => {
    const result = validatePatchOpsSchema([]);
    expect(result.ok).toBe(false);
  });

  it('rejects unknown op type', () => {
    const result = validatePatchOpsSchema([{ op: 'unknownOp' }]);
    expect(result.ok).toBe(false);
  });

  it('validates workspace index shape', () => {
    const result = validateWorkspaceIndexSchema({
      projects: [{ id: 'p1', displayName: 'Test' }],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects workspace index without projects array', () => {
    const result = validateWorkspaceIndexSchema({});
    expect(result.ok).toBe(false);
  });
});
