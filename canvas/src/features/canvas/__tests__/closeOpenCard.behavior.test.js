import { describe, expect, it, vi } from 'vitest';

async function closeOpenCard({
  openId,
  cardType,
  flushState,
  force = false,
  confirmDiscard = () => false,
  clearOpen = () => {},
}) {
  if (!openId) return true;
  if (cardType === 'flow') {
    if (flushState?.isDirty?.()) {
      const result = await flushState.flushSave?.();
      if (!result?.ok) {
        if (!force && !confirmDiscard()) {
          return false;
        }
      }
    }
  }
  clearOpen();
  return true;
}

describe('closeOpenCard flush guard', () => {
  it('closes without flushing when the flow is clean', async () => {
    const clearOpen = vi.fn();
    const flushSave = vi.fn();

    const closed = await closeOpenCard({
      openId: 'card-1',
      cardType: 'flow',
      flushState: { isDirty: () => false, flushSave },
      clearOpen,
    });

    expect(closed).toBe(true);
    expect(flushSave).not.toHaveBeenCalled();
    expect(clearOpen).toHaveBeenCalledTimes(1);
  });

  it('blocks close when flush fails and discard is declined', async () => {
    const clearOpen = vi.fn();
    const flushSave = vi.fn().mockResolvedValue({ ok: false, conflict: false, error: new Error('network') });

    const closed = await closeOpenCard({
      openId: 'card-1',
      cardType: 'flow',
      flushState: { isDirty: () => true, flushSave },
      clearOpen,
    });

    expect(closed).toBe(false);
    expect(flushSave).toHaveBeenCalledTimes(1);
    expect(clearOpen).not.toHaveBeenCalled();
  });

  it('closes when flush fails but discard is confirmed', async () => {
    const clearOpen = vi.fn();
    const flushSave = vi.fn().mockResolvedValue({ ok: false, conflict: true, error: new Error('conflict') });

    const closed = await closeOpenCard({
      openId: 'card-1',
      cardType: 'flow',
      flushState: { isDirty: () => true, flushSave },
      confirmDiscard: () => true,
      clearOpen,
    });

    expect(closed).toBe(true);
    expect(clearOpen).toHaveBeenCalledTimes(1);
  });

  it('closes when force is true even if flush fails', async () => {
    const clearOpen = vi.fn();
    const flushSave = vi.fn().mockResolvedValue({ ok: false, conflict: false, error: new Error('network') });

    const closed = await closeOpenCard({
      openId: 'card-1',
      cardType: 'flow',
      flushState: { isDirty: () => true, flushSave },
      force: true,
      clearOpen,
    });

    expect(closed).toBe(true);
    expect(clearOpen).toHaveBeenCalledTimes(1);
  });
});
