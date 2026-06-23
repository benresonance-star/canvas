import { describe, expect, it } from 'vitest';
import { nextLiveRunAt } from '../liveSchedule.js';

describe('live schedule', () => {
  it('returns null for manual feeds', () => {
    expect(nextLiveRunAt({ scheduleMode: 'manual' })).toBeNull();
  });

  it('finds the next Melbourne local time', () => {
    const next = nextLiveRunAt({
      scheduleMode: 'daily', preferredTimeLocal: '08:00', timezone: 'Australia/Melbourne',
    }, new Date('2026-06-20T00:00:00Z'));
    expect(next.toISOString()).toBe('2026-06-20T22:00:00.000Z');
  });
});
