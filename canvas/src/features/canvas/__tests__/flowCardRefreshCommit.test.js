import { describe, expect, it, vi } from 'vitest';

function createSerialQueue() {
  let queue = Promise.resolve();
  return (task) => {
    queue = queue.then(task, task);
    return queue;
  };
}

describe('flow card refresh commit queue', () => {
  it('serializes concurrent commits so later refreshes run after earlier ones finish', async () => {
    const order = [];
    const enqueue = createSerialQueue();

    await Promise.all([
      enqueue(async () => {
        order.push('start-1');
        await new Promise((resolve) => { setTimeout(resolve, 20); });
        order.push('end-1');
      }),
      enqueue(async () => {
        order.push('start-2');
        order.push('end-2');
      }),
    ]);

    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('keeps the queue alive after a failed commit', async () => {
    const enqueue = createSerialQueue();
    const second = vi.fn(async () => 'ok');

    await enqueue(async () => {
      throw new Error('commit failed');
    }).catch(() => {});

    await enqueue(second);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
