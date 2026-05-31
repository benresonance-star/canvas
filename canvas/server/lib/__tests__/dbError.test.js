import { describe, it, expect } from 'vitest';
import {
  formatDbError,
  isDbConnectionError,
  DB_UNAVAILABLE_MESSAGE,
} from '../dbError.js';

describe('formatDbError', () => {
  it('uses first AggregateError child message', () => {
    const e = new AggregateError([new Error('connect ECONNREFUSED')], '');
    expect(formatDbError(e)).toBe('connect ECONNREFUSED');
  });

  it('formats pg-style code without message', () => {
    expect(formatDbError({ code: 'ECONNREFUSED', message: '' })).toBe(
      'ECONNREFUSED: database unreachable',
    );
  });

  it('falls back when empty', () => {
    expect(formatDbError({ message: '' })).toBe('Database unreachable');
  });
});

describe('isDbConnectionError', () => {
  it('detects ECONNREFUSED', () => {
    expect(isDbConnectionError({ code: 'ECONNREFUSED' })).toBe(true);
  });

  it('detects nested AggregateError', () => {
    const e = new AggregateError([{ code: 'ECONNREFUSED' }], '');
    expect(isDbConnectionError(e)).toBe(true);
  });
});

describe('DB_UNAVAILABLE_MESSAGE', () => {
  it('mentions docker', () => {
    expect(DB_UNAVAILABLE_MESSAGE).toMatch(/Docker/i);
  });
});
