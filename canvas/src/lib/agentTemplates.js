const DEFAULT_PROVIDER = 'openai';
const DEFAULT_MODEL = 'openai/gpt-5.5';

export const TEMPLATE_FILE_KINDS = ['instructions', 'model', 'skill', 'tool'];

const TOOL_PERMISSION_ALLOWLIST = new Set([
  'execute_code',
  'read_context',
  'write_artifact',
  'search_web',
]);

const UNSAFE_TOOL_PATTERNS = [
  /\bimport\b/,
  /\brequire\s*\(/,
  /\bfunction\b/,
  /=>/,
  /\bprocess\b/,
  /\bchild_process\b/,
  /\bfs\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
];

export function slugifyAgentId(value) {
  return String(value || '')
    .trim()
    .replace(/^Agent\s*-\s*/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'agent';
}

function titleFromId(id) {
  return String(id || 'agent')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function labelFromAgentFolderName(folderName) {
  const clean = String(folderName || '')
    .trim()
    .replace(/^Agent\s*-\s*/i, '')
    .trim();
  return clean ? `${titleFromId(clean)} Agent` : 'Agent';
}

export function parseMarkdownFrontmatter(content) {
  const text = String(content || '');
  if (!text.startsWith('---')) return { data: {}, body: text.trim() };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { data: {}, body: text.trim() };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    data[match[1]] = value;
  }
  return { data, body };
}

export function detectTemplateFileKind(filename) {
  const normalized = String(filename || '').replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/instructions/') || normalized.endsWith('instructions.md')) {
    return 'instructions';
  }
  if (normalized.includes('/models/') || normalized.endsWith('agent.ts')) {
    return 'model';
  }
  if (normalized.includes('/skills/') || normalized.includes('skills-')) {
    return 'skill';
  }
  if (normalized.includes('/tools/') || normalized.includes('tools-')) {
    return 'tool';
  }
  return null;
}

export function parseAgentModelFile(content) {
  const text = String(content || '').trim();
  const model = text.match(/\bmodel\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? DEFAULT_MODEL;
  const provider = model.startsWith('openai/') ? 'openai' : DEFAULT_PROVIDER;
  return { provider, model };
}

export function parseSkillFile(content, filename = '') {
  const { data, body } = parseMarkdownFrontmatter(content);
  const fallbackName = String(filename || '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .replace(/^skills?-?/i, '')
    || 'skill';
  return {
    name: data.name || slugifyAgentId(fallbackName),
    description: data.description || '',
    body,
  };
}

function parsePermissions(raw) {
  const permissions = [];
  for (const match of String(raw || '').matchAll(/['"]([^'"]+)['"]/g)) {
    if (TOOL_PERMISSION_ALLOWLIST.has(match[1])) permissions.push(match[1]);
  }
  return [...new Set(permissions)];
}

function parseToolObject(raw) {
  const getString = (key) =>
    raw.match(new RegExp(`\\b${key}\\s*:\\s*['"]([^'"]+)['"]`))?.[1] ?? '';
  const id = getString('id');
  if (!id) return null;
  const permissionsRaw = raw.match(/\bpermissions\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const enabledRaw = raw.match(/\benabled\s*:\s*(true|false)/)?.[1];
  return {
    id,
    label: getString('label') || titleFromId(id),
    description: getString('description'),
    permissions: parsePermissions(permissionsRaw),
    enabled: enabledRaw === 'true',
  };
}

export function parseToolsFile(content) {
  const text = String(content || '').trim();
  if (!text) return { tools: [] };
  for (const pattern of UNSAFE_TOOL_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error('Tools.ts must be declarative config only.');
    }
  }
  const toolsArray = text.match(/\btools\s*:\s*\[([\s\S]*)\]/)?.[1] ?? '';
  if (!toolsArray.trim()) return { tools: [] };
  const tools = [];
  for (const match of toolsArray.matchAll(/\{([\s\S]*?)\}/g)) {
    const parsed = parseToolObject(match[1]);
    if (parsed) tools.push(parsed);
  }
  return { tools };
}

export function parseTemplateFilePart(file) {
  const filename = file.filename || file.path || '';
  const kind = file.kind || detectTemplateFileKind(filename);
  if (!TEMPLATE_FILE_KINDS.includes(kind)) {
    throw new Error(`Unknown agent template file kind: ${kind || filename}`);
  }
  const content = String(file.content ?? '');
  let parsed = {};
  if (kind === 'model') parsed = parseAgentModelFile(content);
  if (kind === 'skill') parsed = parseSkillFile(content, filename);
  if (kind === 'tool') parsed = parseToolsFile(content);
  if (kind === 'instructions') parsed = { body: content.trim() };
  return {
    id: file.id || `${kind}-${slugifyAgentId(filename || kind)}`,
    kind,
    filename: filename || `${kind}.md`,
    content,
    parsed,
  };
}

export function normalizeAgentTemplate(input = {}) {
  const id = slugifyAgentId(input.id || input.label || input.name);
  const files = (input.files || []).map(parseTemplateFilePart);
  const modelFile = files.find((file) => file.kind === 'model');
  const provider = input.provider || modelFile?.parsed?.provider || DEFAULT_PROVIDER;
  const model = input.model || modelFile?.parsed?.model || DEFAULT_MODEL;
  const instructions =
    input.instructions
    || files.find((file) => file.kind === 'instructions')?.parsed?.body
    || '';
  const skills = [
    ...(input.skills || []),
    ...files.filter((file) => file.kind === 'skill').map((file) => file.parsed),
  ].filter((skill) => skill?.name || skill?.body);
  const tools = [
    ...(input.tools || []),
    ...files.flatMap((file) => (file.kind === 'tool' ? file.parsed.tools || [] : [])),
  ];
  return {
    id,
    label: input.label || labelFromAgentFolderName(input.name || id),
    description: input.description || '',
    provider,
    model,
    enabled: input.enabled !== false,
    instructions,
    skills,
    tools,
    files,
  };
}

export function compileAgentTemplateSystemContext(baseContext, template) {
  const t = normalizeAgentTemplate(template);
  const sections = [String(baseContext || '').trim()].filter(Boolean);
  if (t.instructions) {
    sections.push(`# Agent instructions\n${t.instructions.trim()}`);
  }
  if (t.skills.length) {
    sections.push(`# Skills\n${t.skills.map((skill) => {
      const desc = skill.description ? ` — ${skill.description}` : '';
      return `## ${skill.name}${desc}\n${String(skill.body || '').trim()}`;
    }).join('\n\n')}`);
  }
  if (t.tools.length) {
    sections.push(`# Tools\n${t.tools.map((tool) => {
      const status = tool.enabled ? 'declared' : 'declared but not enabled';
      const permissions = tool.permissions?.length ? ` Permissions: ${tool.permissions.join(', ')}.` : '';
      return `- ${tool.label || tool.id}: ${tool.description || 'No description'} (${status}).${permissions}`;
    }).join('\n')}`);
  }
  return sections.join('\n\n');
}

export function upsertAgentTemplateList(templates = [], template) {
  if (!template?.id) return templates;
  const next = [];
  let inserted = false;
  for (const entry of templates) {
    if (entry?.id === template.id) {
      next.push(template);
      inserted = true;
    } else {
      next.push(entry);
    }
  }
  if (!inserted) next.push(template);
  return next.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
}
