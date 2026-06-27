import { describe, expect, it } from 'vitest';
import {
  highlightCode,
  resolveCodeLanguage,
} from '../codeHighlight.js';

describe('codeHighlight', () => {
  it('resolves TypeScript language from .ts filenames', () => {
    expect(resolveCodeLanguage({ filename: 'src__example-v1.ts' })).toBe('typescript');
  });

  it('resolves JSON and Python languages from filenames', () => {
    expect(resolveCodeLanguage({ filename: 'data__settings-v1.json' })).toBe('json');
    expect(resolveCodeLanguage({ filename: 'scripts__clean-v1.py' })).toBe('python');
  });

  it('highlights TypeScript syntax', () => {
    const highlighted = highlightCode(
      "export type Person = { name: string };\nconst answer: number = 42;\n",
      { filename: 'src__example-v1.ts' },
    );

    expect(highlighted).toMatchObject({
      language: 'typescript',
      highlighted: true,
    });
    expect(highlighted.html).toContain('hljs-keyword');
    expect(highlighted.html).toContain('export');
    expect(highlighted.html).toContain('Person');
  });

  it('highlights JSON and Python syntax', () => {
    expect(highlightCode('{"enabled": true}', { ext: 'json' })).toMatchObject({
      language: 'json',
      highlighted: true,
    });
    expect(highlightCode('def run():\n    return True\n', { ext: 'py' })).toMatchObject({
      language: 'python',
      highlighted: true,
    });
  });

  it('escapes unsupported code without rendering raw HTML', () => {
    const highlighted = highlightCode('<script>alert("x")</script>', {
      ext: 'unsupported',
    });

    expect(highlighted.highlighted).toBe(false);
    expect(highlighted.html).toContain('&lt;script&gt;');
    expect(highlighted.html).toContain('&quot;x&quot;');
    expect(highlighted.html).not.toContain('<script>');
  });
});
