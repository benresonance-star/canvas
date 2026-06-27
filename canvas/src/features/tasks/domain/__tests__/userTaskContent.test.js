import { describe, it, expect } from 'vitest';
import {
  DEFAULT_USER_TASK_STATUS,
  parseUserTask,
  serializeUserTask,
} from '../userTaskContent.js';

describe('userTaskContent', () => {
  it('serializes task status and body with frontmatter', () => {
    expect(serializeUserTask({ taskStatus: 'important', body: 'Ship it' })).toBe(
      '---\ntaskStatus: important\n---\n\nShip it',
    );
  });

  it('defaults to general status', () => {
    expect(parseUserTask('plain body')).toEqual({
      taskStatus: DEFAULT_USER_TASK_STATUS,
      body: 'plain body',
    });
  });

  it('parses frontmatter status and body', () => {
    const content = serializeUserTask({ taskStatus: 'important', body: 'Do this first' });
    expect(parseUserTask(content)).toEqual({
      taskStatus: 'important',
      body: 'Do this first',
    });
  });
});
