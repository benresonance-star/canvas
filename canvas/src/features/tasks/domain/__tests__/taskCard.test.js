import { describe, it, expect } from 'vitest';
import {
  getUserTaskHeaderClass,
  resolveUserTaskStatus,
  sortUserTasks,
} from '../taskCard.js';
import { serializeUserTask } from '../userTaskContent.js';

describe('taskCard', () => {
  it('resolves status from card field or content', () => {
    const card = {
      name: 'todo',
      versions: [{
        version: 1,
        content: serializeUserTask({ taskStatus: 'important', body: 'urgent' }),
      }],
      pinnedVersion: 1,
    };
    expect(resolveUserTaskStatus({ ...card, taskStatus: 'general' })).toBe('general');
    expect(resolveUserTaskStatus(card)).toBe('important');
  });

  it('sorts important tasks before general tasks', () => {
    const tasks = sortUserTasks([
      { id: '1', name: 'B', taskStatus: 'general' },
      { id: '2', name: 'A', taskStatus: 'important' },
      { id: '3', name: 'C', taskStatus: 'general' },
    ]);
    expect(tasks.map((task) => task.id)).toEqual(['2', '1', '3']);
  });

  it('returns distinct header classes by status', () => {
    expect(getUserTaskHeaderClass('important')).toContain('4a1515');
    expect(getUserTaskHeaderClass('general')).toContain('4a3010');
  });
});
