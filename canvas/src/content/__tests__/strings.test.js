import { describe, expect, it } from 'vitest';
import { strings } from '../strings.js';

describe('agent strings', () => {
  it('summarizes artifact-scoped context separately from selected items', () => {
    expect(strings.agent.contextMessageSummary('artifact', 1, ['Report'])).toBe(
      'Context: 1 open artifact (Report)',
    );
  });
});
