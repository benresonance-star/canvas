import { describe, expect, it } from 'vitest';
import {
  compileAgentTemplateSystemContext,
  normalizeAgentTemplate,
  parseToolsFile,
  upsertAgentTemplateList,
} from '../agentTemplates.js';

describe('agentTemplates', () => {
  it('normalizes instructions, model, skills, and tools from file parts', () => {
    const template = normalizeAgentTemplate({
      id: 'Brainstorming Agent',
      files: [
        {
          kind: 'instructions',
          filename: 'Instructions.md',
          content: 'You are a brainstorming agent.',
        },
        {
          kind: 'model',
          filename: 'agent.ts',
          content: 'model: "openai/gpt-5.5"',
        },
        {
          kind: 'skill',
          filename: 'skills-grilling.md',
          content: '---\nname: grilling\ndescription: Stress-test plans\n---\n\nAsk one question.',
        },
        {
          kind: 'tool',
          filename: 'tools-python.ts',
          content:
            'export default { tools: [{ id: "python", label: "Python", permissions: ["execute_code"], enabled: false }] };',
        },
      ],
    });

    expect(template).toMatchObject({
      id: 'brainstorming-agent',
      provider: 'openai',
      model: 'openai/gpt-5.5',
      instructions: 'You are a brainstorming agent.',
    });
    expect(template.skills[0]).toMatchObject({ name: 'grilling' });
    expect(template.tools[0]).toMatchObject({ id: 'python', permissions: ['execute_code'] });
  });

  it('rejects executable tool files', () => {
    expect(() => parseToolsFile('import fs from "fs"; export default { tools: [] };')).toThrow(
      'declarative config',
    );
  });

  it('compiles template content into system context', () => {
    const context = compileAgentTemplateSystemContext('Base', {
      id: 'brainstorming',
      instructions: 'Think from first principles.',
      skills: [{ name: 'grilling', description: 'Stress-test', body: 'Ask one question.' }],
      tools: [{ id: 'python', label: 'Python', description: 'Run code', enabled: false }],
    });

    expect(context).toContain('Base');
    expect(context).toContain('Think from first principles.');
    expect(context).toContain('## grilling');
    expect(context).toContain('Python');
  });

  it('upserts saved templates for immediate Agent Type selection', () => {
    const existing = [
      { id: 'research', label: 'Research Agent' },
      { id: 'planning', label: 'Planning Agent' },
    ];

    expect(upsertAgentTemplateList(existing, { id: 'brainstorming', label: 'Brainstorming Agent' }))
      .toEqual([
        { id: 'brainstorming', label: 'Brainstorming Agent' },
        { id: 'planning', label: 'Planning Agent' },
        { id: 'research', label: 'Research Agent' },
      ]);

    expect(upsertAgentTemplateList(existing, { id: 'planning', label: 'Planning Agent v2' }))
      .toContainEqual({ id: 'planning', label: 'Planning Agent v2' });
  });
});
