import { describe, expect, it } from 'vitest';
import { formatLiveLastUpdated, liveAgentOutputSchema, validateLiveModel } from '../liveArtifact.js';

describe('live artifact domain', () => {
  it('keeps model and reasoning effort as separate validated settings', () => {
    expect(validateLiveModel('openai', 'gpt-5.5', 'medium')).toEqual({
      provider: 'openai', model: 'gpt-5.5', reasoningEffort: 'medium',
    });
    expect(() => validateLiveModel('openai', 'gpt-4o-mini', 'medium')).toThrow();
  });

  it('rejects malformed agent feed output', () => {
    expect(() => liveAgentOutputSchema.parse({ title: 'Missing fields' })).toThrow();
    expect(() => liveAgentOutputSchema.parse({
      title: 'Feed', reportDate: '2026-06-20', overview: 'Current position',
      meaningfulChangeDetected: true, changeScore: 1.2,
      changesSinceLastUpdate: [], currentPosition: '', risks: [], openQuestions: [],
      recommendedNextActions: [], staleOrMissingInformation: [], markdownBody: '# Feed',
    })).toThrow();
  });

  it('formatLiveLastUpdated returns time and date in feed timezone', () => {
    expect(formatLiveLastUpdated('2026-06-23T09:30:00.000Z', 'Australia/Melbourne')).toBe(
      '7:30pm | 23 June 2026',
    );
  });

  it('formatLiveLastUpdated returns null for missing or invalid input', () => {
    expect(formatLiveLastUpdated(null, 'UTC')).toBeNull();
    expect(formatLiveLastUpdated('not-a-date', 'UTC')).toBeNull();
    expect(formatLiveLastUpdated('2026-06-23T09:30:00.000Z', 'Invalid/Zone')).toBeNull();
  });
});
