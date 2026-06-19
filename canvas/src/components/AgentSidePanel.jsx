import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Paperclip,
  Send,
  SlidersHorizontal,
  FileText,
  FileX,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { strings } from '../content/strings.js';
import { AGENT_PROFILES } from '../lib/agentProfiles.js';
import {
  CONNECTORS,
  agentInputDisabledMessage,
  agentCanChat,
  defaultAgentTypeLabelForProvider,
  getConnectorById,
  mergeConnectorMeta,
} from '../lib/agentConnectors.js';
import { AgentThreadSection } from './AgentThreadSection.jsx';
import { AgentChatThreadView } from './AgentChatThreadView.jsx';
import { cardLabel } from '../lib/agentContext.js';
import { ThreadContextBar } from './ThreadContextBar.jsx';
import {
  compileAgentTemplateSystemContext,
  detectTemplateFileKind,
  normalizeAgentTemplate,
  parseAgentModelFile,
  slugifyAgentId,
} from '../lib/agentTemplates.js';

function loadStatusLabel(status, cardType) {
  if (status === 'included' && cardType === 'image') {
    return strings.agent.contextSentAsImage;
  }
  switch (status) {
    case 'included':
      return strings.agent.contextIncluded;
    case 'needs_folder':
      return strings.agent.contextNeedsFolder;
    case 'unsupported':
      return strings.agent.contextNoContent;
    case 'error':
      return strings.agent.contextPdfExtractFailed;
    case 'empty':
      return strings.agent.contextNoContent;
    default:
      return null;
  }
}

function deliveryStatusLabel(status) {
  switch (status) {
    case 'sent_to_ai':
      return strings.agent.contextSentToAi;
    case 'updated_resend':
      return strings.agent.contextUpdatedResend;
    case 'sends_on_next':
      return strings.agent.contextSendsOnNextMessage;
    case 'needs_folder':
      return strings.agent.contextNeedsFolder;
    case 'empty':
    case 'unsupported':
      return strings.agent.contextNoContent;
    default:
      return null;
  }
}

function deliveryBadgeClass(status) {
  if (status === 'sent_to_ai') return 'text-success';
  if (status === 'updated_resend') return 'text-warning';
  if (status === 'needs_folder' || status === 'empty' || status === 'unsupported') {
    return 'text-warning';
  }
  return 'text-muted';
}

function ContextCardList({
  cards,
  statusByCardId = {},
  deliveryByCardId = {},
  onRemoveCard,
  showRemoveControls = false,
  maxRows = 6,
}) {
  if (!cards.length) return null;
  const shown = cards.slice(0, maxRows);
  const rest = cards.length - shown.length;
  return (
    <ul className="mt-1 ml-3 max-h-16 overflow-y-auto space-y-0.5 border-l border-border-subtle pl-1.5">
      {shown.map((card) => {
        const delivery = deliveryByCardId[card.id];
        const loadStatus = statusByCardId[card.id];
        const deliveryBadge = delivery ? deliveryStatusLabel(delivery) : null;
        const loadBadge =
          !deliveryBadge && loadStatus ? loadStatusLabel(loadStatus, card.type) : null;
        const badge = deliveryBadge || loadBadge;
        const badgeStatus = delivery || loadStatus;
        const canRemove = typeof onRemoveCard === 'function';
        const showRemove = showRemoveControls || canRemove;
        return (
          <li key={card.id} className="sans text-[10px] text-secondary min-w-0" title={cardLabel(card)}>
            <div className="flex items-center gap-1.5 min-w-0">
              {showRemove && (
                <button
                  type="button"
                  disabled={!canRemove}
                  className="shrink-0 inline-flex h-3 w-3 items-center justify-center rounded-full border border-white/80 bg-red-600 text-[9px] font-bold leading-none text-white shadow-sm transition hover:scale-105 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-danger-ring disabled:opacity-70"
                  aria-label={`${strings.agent.contextRemoveItem}: ${cardLabel(card)}`}
                  title={strings.agent.contextRemoveItem}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveCard?.(card.id);
                  }}
                >
                  <span aria-hidden>×</span>
                </button>
              )}
              <span className="block truncate min-w-0 flex-1">{cardLabel(card)}</span>
            </div>
            {badge && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={showRemove ? 'shrink-0 w-3' : 'hidden'} aria-hidden />
                <span className={`block truncate text-[9px] ${deliveryBadgeClass(badgeStatus)}`}>
                  {badge}
                </span>
              </div>
            )}
          </li>
        );
      })}
      {rest > 0 && (
        <li className="sans text-[10px] text-muted">+{rest} more</li>
      )}
    </ul>
  );
}

function ApiKeyPillMenu({
  keyHint,
  onReplace,
  onRemove,
  showReplaceForm,
  onCancelReplace,
  apiKeyDraft,
  onApiKeyDraftChange,
  onSaveKey,
  apiKeySaving,
  apiKeyFeedback,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (showReplaceForm) {
    return (
      <form
        onSubmit={onSaveKey}
        className="space-y-2 rounded-full border border-border bg-surface-muted/80 px-3 py-2"
      >
        <input
          type="password"
          autoComplete="off"
          value={apiKeyDraft}
          onChange={(e) => onApiKeyDraftChange(e.target.value)}
          placeholder={strings.agent.apiKeyPlaceholder}
          className="w-full sans text-xs bg-transparent border-0 px-1 py-0.5 text-primary focus:outline-none"
        />
        <div className="flex items-center gap-2 pl-1">
          <button
            type="submit"
            disabled={!apiKeyDraft.trim() || apiKeySaving}
            className="sans text-[10px] bg-accent text-on-accent px-2.5 py-0.5 rounded-full disabled:opacity-40"
          >
            {apiKeySaving ? strings.agent.apiKeySaving : strings.agent.apiKeySave}
          </button>
          <button
            type="button"
            className="sans text-[10px] text-muted hover:text-primary"
            onClick={onCancelReplace}
          >
            {strings.agent.apiKeyCancel}
          </button>
        </div>
        {apiKeyFeedback && (
          <p
            className={`sans text-[10px] pl-1 ${
              apiKeyFeedback.type === 'success' ? 'text-success' : 'text-danger'
            }`}
            role="status"
          >
            {apiKeyFeedback.message}
          </p>
        )}
      </form>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-block max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 max-w-full rounded-full border border-border-subtle bg-surface-muted/80 hover:bg-surface-muted px-2.5 py-1 transition"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" aria-hidden />
        <span className="sans text-[11px] text-secondary truncate">
          {strings.agent.apiKeyConfigured(keyHint)}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[9rem] rounded-md border border-border bg-surface py-0.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left sans text-[11px] text-primary px-3 py-1.5 hover:bg-surface-muted"
            onClick={() => {
              setOpen(false);
              onReplace();
            }}
          >
            {strings.agent.apiKeyReplace}
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left sans text-[11px] text-danger px-3 py-1.5 hover:bg-surface-muted"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            {strings.agent.apiKeyRemove}
          </button>
        </div>
      )}
    </div>
  );
}

function ContextPendingBanners({ deliveryState, contextEstimates = [] }) {
  const { pendingAdd = [], pendingRemove = [] } = deliveryState ?? {};
  if (!pendingAdd.length && !pendingRemove.length) return null;

  const addNames = pendingAdd.map((c) => cardLabel(c)).join(', ');
  const removeNames = pendingRemove.map((r) => r.label).join(', ');
  const pendingAddEstimates = contextEstimates.filter((e) =>
    pendingAdd.some((c) => c.id === e.cardId),
  );
  const estTokens = pendingAddEstimates.reduce(
    (sum, e) => sum + (e.estimatedChars ?? 0),
    0,
  );
  const tokenHint =
    estTokens > 0 ? ` (~${Math.ceil(estTokens / 4).toLocaleString()} tokens est.)` : '';

  return (
    <div className="space-y-1 mb-1">
      {pendingAdd.length > 0 && (
        <p className="sans text-[10px] text-warning bg-warning/10 border border-warning/25 rounded px-2 py-1.5" role="status">
          {strings.agent.contextPendingAddBanner(pendingAdd.length, addNames)}
          {tokenHint}
        </p>
      )}
      {pendingRemove.length > 0 && (
        <p className="sans text-[10px] text-warning bg-warning/10 border border-warning/25 rounded px-2 py-1.5" role="status">
          {strings.agent.contextPendingRemoveBanner(pendingRemove.length, removeNames)}
        </p>
      )}
    </div>
  );
}

const PANEL_SECTION_SHELL = {
  setup: 'bg-surface-muted border-border',
  context: 'bg-preview-bg border-border',
  chat: 'bg-surface border-border shadow-[var(--shadow-card)]',
};

const PANEL_SECTION_HEADER = {
  setup: 'border-border bg-surface',
  context: 'border-border bg-accent/10',
  chat: 'border-border bg-accent/[0.12]',
};

/** Bordered grouping for agent panel sections (setup, context, chat). */
function AgentPanelSection({
  variant = 'setup',
  title,
  children,
  className = '',
  bodyClassName = '',
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
  collapsedSummary = null,
}) {
  const headerClassName =
    `flex items-center gap-2 px-2.5 py-1.5 border-b shrink-0 ${PANEL_SECTION_HEADER[variant] ?? PANEL_SECTION_HEADER.setup}`;
  const titleNode = (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <span className="w-1 h-3.5 rounded-full bg-accent shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="sans text-[10px] uppercase tracking-[0.14em] text-primary font-medium">
          {title}
        </span>
        {collapsed && collapsedSummary ? (
          <div className="mt-0.5">{collapsedSummary}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      className={`rounded-xl border overflow-hidden min-w-0 ${PANEL_SECTION_SHELL[variant] ?? PANEL_SECTION_SHELL.setup} ${className}`.trim()}
    >
      {title ? (
        <header className={headerClassName}>
          {collapsible ? (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
              onClick={onToggleCollapsed}
            >
              {titleNode}
              <span className="ml-auto shrink-0 text-muted pt-0.5" aria-hidden>
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </span>
            </button>
          ) : (
            titleNode
          )}
        </header>
      ) : null}
      {!collapsed && (
        <div className={`px-2.5 py-2 space-y-2 min-w-0 ${bodyClassName}`.trim()}>
          {children}
        </div>
      )}
    </section>
  );
}

const DEFAULT_TEMPLATE_DRAFT = {
  id: 'brainstorming',
  label: 'Brainstorming Agent',
  description: '',
  provider: 'openai',
  model: 'openai/gpt-5.5',
  enabled: true,
  instructions: '',
  skillsText: '',
  toolsText: '',
  revision: 0,
};

function draftFromTemplate(template) {
  if (!template) return DEFAULT_TEMPLATE_DRAFT;
  const instructionsFile = template.files?.find((file) => file.kind === 'instructions');
  const skillFiles = template.files?.filter((file) => file.kind === 'skill') ?? [];
  const toolFile = template.files?.find((file) => file.kind === 'tool');
  return {
    id: template.id,
    label: template.label,
    description: template.description ?? '',
    provider: template.provider ?? 'openai',
    model: template.model ?? 'openai/gpt-5.5',
    enabled: template.enabled !== false,
    instructions: instructionsFile?.content ?? template.instructions ?? '',
    skillsText:
      skillFiles.map((file) => file.content).join('\n\n---skill---\n\n')
      || template.skills?.map((skill) =>
        `---\nname: ${skill.name}\ndescription: ${skill.description ?? ''}\n---\n\n${skill.body ?? ''}`,
      ).join('\n\n---skill---\n\n')
      || '',
    toolsText:
      toolFile?.content
      || (template.tools?.length
        ? `export default ${JSON.stringify({ tools: template.tools }, null, 2)};`
        : ''),
    revision: template.revision ?? 0,
  };
}

function templateFromDraft(draft) {
  const id = slugifyAgentId(draft.id || draft.label);
  const files = [
    {
      id: 'instructions',
      kind: 'instructions',
      filename: 'Instructions.md',
      content: draft.instructions,
    },
    {
      id: 'model',
      kind: 'model',
      filename: 'agent.ts',
      content: `model: "${draft.model || 'openai/gpt-5.5'}"`,
    },
  ];
  const skillBodies = draft.skillsText
    .split(/\n\s*---skill---\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
  skillBodies.forEach((content, index) => {
    files.push({
      id: `skill-${index + 1}`,
      kind: 'skill',
      filename: `skills-${index + 1}.md`,
      content,
    });
  });
  if (draft.toolsText.trim()) {
    files.push({
      id: 'tools',
      kind: 'tool',
      filename: 'tools.ts',
      content: draft.toolsText,
    });
  }
  return normalizeAgentTemplate({
    id,
    label: draft.label || `${id} Agent`,
    description: draft.description,
    provider: draft.provider || 'openai',
    model: draft.model || 'openai/gpt-5.5',
    enabled: draft.enabled,
    files,
  });
}

function AgentTemplateConfigurator({
  templates,
  activeTemplateId,
  selectedProvider = 'openai',
  activeThread,
  threadTemplate,
  selectedDiffersFromThread = false,
  threadCompatible = true,
  threadNeedsDefaultAgentType = false,
  onTemplateChange,
  onSaveTemplate,
  onDeleteTemplate,
  onImportMasterTemplates,
  onApplyAgentTypeToThread,
  onUseDefaultAgentTypeForThread,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_TEMPLATE_DRAFT);
  const [status, setStatus] = useState(null);
  const defaultLabel = defaultAgentTypeLabelForProvider(selectedProvider);
  const compatibleTemplates = templates.filter((template) => template.provider === selectedProvider);
  const activeTemplate =
    compatibleTemplates.find((template) => template.id === activeTemplateId) ?? null;

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const preview = (() => {
    try {
      return compileAgentTemplateSystemContext(
        'You are a helpful assistant embedded in Canvas.',
        templateFromDraft(draft),
      );
    } catch (err) {
      return `Template validation error: ${err.message}`;
    }
  })();

  const save = async () => {
    setStatus(null);
    try {
      const template = templateFromDraft(draft);
      const saved = await onSaveTemplate?.(template, draft.revision ?? 0);
      if (!saved?.id) {
        throw new Error('Template save did not return an Agent Type. Try again or refresh templates.');
      }
      const active = saved;
      setDraft(draftFromTemplate(active));
      onTemplateChange?.(active.id);
      setStatus({
        type: 'success',
        text: `Saved ${active.label} as an Agent Type. It is now active for this chat.`,
      });
    } catch (err) {
      setStatus({ type: 'error', text: err?.message || 'Could not save template.' });
    }
  };

  const remove = async () => {
    if (!activeTemplate?.id) return;
    const ok = window.confirm(`Delete Agent Type "${activeTemplate.label}"?`);
    if (!ok) return;
    try {
      await onDeleteTemplate?.(activeTemplate.id);
      setDraft(DEFAULT_TEMPLATE_DRAFT);
      setStatus({ type: 'success', text: 'Agent Type deleted.' });
    } catch (err) {
      setStatus({ type: 'error', text: err?.message || 'Could not delete template.' });
    }
  };

  const importMaster = async () => {
    setStatus(null);
    try {
      const imported = await onImportMasterTemplates?.();
      setStatus({
        type: 'success',
        text: `Imported ${imported?.length ?? 0} template${imported?.length === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      setStatus({ type: 'error', text: err?.message || 'Could not import templates.' });
    }
  };

  const uploadFiles = async (fileList) => {
    const files = [...(fileList ?? [])];
    if (!files.length) return;
    setStatus(null);
    try {
      const parts = await Promise.all(
        files.map(async (file) => ({
          filename: file.webkitRelativePath || file.name,
          content: await file.text(),
        })),
      );
      const patch = {};
      const skillContents = [];
      for (const part of parts) {
        const kind = detectTemplateFileKind(part.filename);
        if (kind === 'instructions') patch.instructions = part.content;
        if (kind === 'model') patch.model = parseAgentModelFile(part.content).model;
        if (kind === 'skill') skillContents.push(part.content);
        if (kind === 'tool') patch.toolsText = part.content;
      }
      if (skillContents.length) {
        patch.skillsText = [draft.skillsText, ...skillContents]
          .filter((value) => value?.trim())
          .join('\n\n---skill---\n\n');
      }
      updateDraft(patch);
      setStatus({ type: 'success', text: `Loaded ${parts.length} file${parts.length === 1 ? '' : 's'}.` });
    } catch (err) {
      setStatus({ type: 'error', text: err?.message || 'Could not load files.' });
    }
  };

  return (
    <section className="rounded-md border border-border-subtle bg-surface-muted/40 px-2 py-1.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="sans text-[10px] uppercase tracking-wider text-muted">
          Agent Type
        </span>
        <button
          type="button"
          className="sans text-[10px] text-link hover:underline"
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            setDraft(draftFromTemplate(activeTemplate));
            setStatus(null);
            setOpen(true);
          }}
        >
          {open ? 'Close configurator' : 'Create / edit'}
        </button>
      </div>
      <p className="sans text-[9px] text-muted leading-snug">
        Agent Types are saved templates in Postgres. The selected type controls this chat's
        instructions, skills, tools, and model.
      </p>
      <button
        type="button"
        className="sans text-[10px] text-link hover:underline"
        onClick={importMaster}
      >
        Import Canvas Master Files
      </button>
      <select
        className="w-full sans text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
        value={activeTemplate?.id ?? ''}
        onChange={(e) => onTemplateChange?.(e.target.value || null)}
      >
        <option value="">{defaultLabel}</option>
        {compatibleTemplates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.label}
          </option>
        ))}
      </select>
      {activeTemplateId && !activeTemplate && (
        <p className="sans text-[9px] text-warning">
          The selected Agent Type is not compatible with this agent and has been ignored.
        </p>
      )}
      {activeTemplate && (
        <p className="sans text-[9px] text-muted">
          Active: {activeTemplate.label} · {activeTemplate.model} · {activeTemplate.skills?.length ?? 0} skills · {activeTemplate.tools?.length ?? 0} tools · revision {activeTemplate.revision ?? 0}
        </p>
      )}
      {!activeTemplate && (
        <p className="sans text-[9px] text-muted">
          Active: {defaultLabel}. Save a configurator draft to create a reusable Agent Type.
        </p>
      )}
      <div className="rounded border border-border-subtle bg-surface/70 px-2 py-1">
        {activeThread ? (
          <>
            <p className="sans text-[9px] text-muted">
              Thread Agent Type:{' '}
              <span className="text-primary">
                {activeThread.agentTypeLabel || threadTemplate?.label || defaultLabel}
              </span>
              {activeThread.model
                ? ` · ${activeThread.model.includes('/') ? activeThread.model : `${activeThread.provider || 'provider'}/${activeThread.model}`}`
                : ''}
            </p>
            {activeThread.agentTemplateId && !threadTemplate && (
              <p className="sans text-[9px] text-warning mt-0.5">
                This thread's saved Agent Type is no longer available. Sends will use the selected fallback until you change the thread.
              </p>
            )}
            {!threadCompatible && (
              <p className="sans text-[9px] text-warning mt-0.5">
                This thread's Agent Type is for another provider. Change it before chatting with this agent.
              </p>
            )}
            {selectedDiffersFromThread && (
              <button
                type="button"
                className="mt-1 sans text-[10px] bg-accent text-on-accent px-2.5 py-1 rounded-full"
                onClick={onApplyAgentTypeToThread}
              >
                Change Agent Type for this thread
              </button>
            )}
            {threadNeedsDefaultAgentType && (
              <button
                type="button"
                className="mt-1 sans text-[10px] bg-accent text-on-accent px-2.5 py-1 rounded-full"
                onClick={onUseDefaultAgentTypeForThread}
              >
                Change to {defaultLabel}
              </button>
            )}
          </>
        ) : (
          <p className="sans text-[9px] text-muted">
            No thread selected. The selected Agent Type will be bound to the next new thread.
          </p>
        )}
      </div>
      {open && (
        <div className="space-y-1.5 pt-1 border-t border-border-subtle">
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="sans text-[9px] uppercase tracking-wider text-muted">Agent ID</span>
              <input
                className="mt-0.5 w-full sans text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
                value={draft.id}
                onChange={(e) => updateDraft({ id: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="sans text-[9px] uppercase tracking-wider text-muted">Model</span>
              <input
                className="mt-0.5 w-full sans text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
                value={draft.model}
                onChange={(e) => updateDraft({ model: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="sans text-[9px] uppercase tracking-wider text-muted">Label</span>
            <input
              className="mt-0.5 w-full sans text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
              value={draft.label}
              onChange={(e) => updateDraft({ label: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="sans text-[9px] uppercase tracking-wider text-muted">Upload Agent Type files</span>
            <input
              type="file"
              multiple
              accept=".md,.ts"
              className="mt-0.5 block w-full sans text-[10px] text-muted"
              onChange={(e) => {
                void uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label className="block">
            <span className="sans text-[9px] uppercase tracking-wider text-muted">Instructions.md</span>
            <textarea
              rows={4}
              className="mt-0.5 w-full sans text-[11px] bg-surface border border-border rounded px-2 py-1 text-primary"
              value={draft.instructions}
              onChange={(e) => updateDraft({ instructions: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="sans text-[9px] uppercase tracking-wider text-muted">Skills.md files</span>
            <textarea
              rows={4}
              className="mt-0.5 w-full sans text-[11px] bg-surface border border-border rounded px-2 py-1 text-primary"
              placeholder="Separate multiple skill files with ---skill---"
              value={draft.skillsText}
              onChange={(e) => updateDraft({ skillsText: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="sans text-[9px] uppercase tracking-wider text-muted">Tools.ts</span>
            <textarea
              rows={3}
              className="mt-0.5 w-full sans text-[11px] bg-surface border border-border rounded px-2 py-1 text-primary"
              value={draft.toolsText}
              onChange={(e) => updateDraft({ toolsText: e.target.value })}
            />
          </label>
          <details>
            <summary className="sans text-[10px] text-link cursor-pointer">Preview compiled prompt</summary>
            <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded bg-canvas/60 p-2 sans text-[9px] text-secondary">
              {preview}
            </pre>
          </details>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sans text-[10px] bg-accent text-on-accent px-2.5 py-1 rounded-full"
              onClick={save}
            >
              Save Agent Type
            </button>
            {activeTemplate && (
              <button
                type="button"
                className="sans text-[10px] text-danger hover:underline"
                onClick={remove}
              >
                Delete
              </button>
            )}
          </div>
          {status && (
            <p className={`sans text-[10px] ${status.type === 'error' ? 'text-danger' : 'text-success'}`}>
              {status.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function AgentSidePanel({
  className = '',
  panelMode = 'multi',
  onPanelModeChange,
  panelModeLocked = false,
  singleConnectorId,
  onSingleConnectorChange,
  connectors = [],
  agentTemplates = [],
  activeAgentTemplateId = null,
  activeAgentThread = null,
  threadAgentTemplate = null,
  selectedAgentTypeDiffersFromThread = false,
  activeThreadAgentTypeCompatible = true,
  selectedThreadNeedsDefaultAgentType = false,
  onAgentTemplateChange,
  onSaveAgentTemplate,
  onDeleteAgentTemplate,
  onImportMasterAgentTemplates,
  onApplyAgentTypeToActiveThread,
  onUseDefaultAgentTypeForActiveThread,
  secretsConfigured = true,
  connectorsOffline = false,
  onRetryConnectors,
  openaiReachable = null,
  openaiReachabilityError = null,
  onSaveApiKey,
  apiKeySaving = false,
  onClearApiKey,
  chatMessages = [],
  chatLoading = false,
  chatError = null,
  contextMode,
  onContextModeChange,
  enabledAgentIds,
  onToggleAgent,
  contextCards = [],
  selectedCardIds,
  onFocusContextCard,
  agentSelectionClick = false,
  onRemoveContextCard,
  onClose,
  onComingSoon,
  messages = [],
  onSendMessage,
  folderNeedsReconnect = false,
  folderNeedsConnect = false,
  connectedFolderName = null,
  contextStatusByCardId = {},
  contextDeliveryByCardId = {},
  contextDeliveryState = null,
  contextScope = 'workspace',
  onRefreshContextSession,
  agentExtendedContext = false,
  onAgentExtendedContextChange,
  contextEstimates = [],
  contextProfileLimits,
  lastTokenEstimate = null,
  chatArtifactRef = null,
  chatArtifactSyncFailed = false,
  chatArtifactSyncReason = null,
  chatPersistTrimmed = false,
  chatSyncRetrying = false,
  onRetryChatSync,
  onOpenChatArtifact,
  onClearChat,
  chatThreads = [],
  activeThreadId = null,
  activeThreadTitle = null,
  threadPickerOpen = false,
  onSelectThread,
  onCreateThread,
  onRenameThread,
  onSwitchThread,
  onDeleteThread,
  flowIncludeNetwork = true,
  onFlowIncludeNetworkChange,
  flowSelectionSummary = null,
  initialCollapsedSections = null,
  onCollapsedSectionsChange = null,
}) {
  const [draft, setDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showReplaceKey, setShowReplaceKey] = useState(false);
  const [apiKeyFeedback, setApiKeyFeedback] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState(() => (
    initialCollapsedSections ?? { setup: false, context: false }
  ));
  const autoReplaceOpenedRef = useRef(false);

  useEffect(() => {
    if (!initialCollapsedSections) return;
    setCollapsedSections(initialCollapsedSections);
  }, [initialCollapsedSections]);

  const toggleSectionCollapsed = (section) => {
    setCollapsedSections((current) => {
      const next = {
        ...current,
        [section]: !current[section],
      };
      onCollapsedSectionsChange?.(next);
      return next;
    });
  };

  const selectedCount = selectedCardIds?.size ?? 0;
  const enabledAgents = AGENT_PROFILES.filter((a) => enabledAgentIds.has(a.id));
  const isSingle = panelMode === 'single';
  const artifactScoped = contextScope === 'artifact';
  const flowScoped = contextScope === 'flow';

  const connectorDef = getConnectorById(singleConnectorId) ?? CONNECTORS[0] ?? null;
  const connectorMeta = connectorDef
    ? connectors.find((c) => c.id === connectorDef.id)
    : null;
  const activeConnector = mergeConnectorMeta(connectorDef, connectorMeta);
  const connectorConfigured = Boolean(activeConnector?.configured);
  const connectorUsable = Boolean(activeConnector?.usable);
  const connectorRequiresCredential = activeConnector?.requiresCredential !== false;
  const activeSetupTemplate =
    agentTemplates.find(
      (template) =>
        template.id === activeAgentTemplateId
        && template.provider === (activeConnector?.provider || 'openai'),
    ) ?? null;
  const setupAgentTypeLabel =
    activeSetupTemplate?.label
    || defaultAgentTypeLabelForProvider(activeConnector?.provider || 'openai');
  const setupCollapsedSummary = isSingle ? (
    <div className="space-y-0.5">
      <p className="sans text-[9px] text-muted truncate">
        <span className="uppercase tracking-wider">{strings.agent.connectorHeading}:</span>{' '}
        <span className="text-primary">{activeConnector?.label || '—'}</span>
      </p>
      <p className="sans text-[9px] text-muted truncate">
        <span className="uppercase tracking-wider">{strings.agent.agentTypeHeading}:</span>{' '}
        <span className="text-primary">{setupAgentTypeLabel}</span>
      </p>
    </div>
  ) : (
    <p className="sans text-[9px] text-muted truncate">
      <span className="uppercase tracking-wider">{strings.agent.agentsLabel}:</span>{' '}
      <span className="text-primary">
        {enabledAgents.length
          ? enabledAgents.map((agent) => agent.label).join(', ')
          : strings.agent.noAgentsEnabled}
      </span>
    </p>
  );
  const canChat =
    agentCanChat({
      panelMode,
      secretsConfigured,
      activeConnector,
    }) && Boolean(activeThreadId) && !threadPickerOpen && activeThreadAgentTypeCompatible;
  const chatDisabledMessage = agentInputDisabledMessage({
    activeConnector,
    hasActiveThread: Boolean(activeThreadId),
    threadCompatible: activeThreadAgentTypeCompatible,
    connectorsOffline,
  });

  useEffect(() => {
    if (
      connectorMeta?.configured
      && !connectorMeta?.usable
      && secretsConfigured
      && connectorRequiresCredential
      && !autoReplaceOpenedRef.current
    ) {
      setShowReplaceKey(true);
      autoReplaceOpenedRef.current = true;
    }
    if (connectorMeta?.usable) {
      autoReplaceOpenedRef.current = false;
    }
  }, [
    connectorMeta?.configured,
    connectorMeta?.usable,
    connectorRequiresCredential,
    secretsConfigured,
  ]);

  const chatSyncFailedMessage =
    chatArtifactSyncReason === 'ingest_failed'
      ? strings.agent.agentChatTranscriptIngestFailed
      : chatArtifactSyncReason === 'folder_write_denied'
        ? strings.agent.agentChatTranscriptFolderWriteDenied
        : chatArtifactSyncReason === 'folder_write_failed'
          ? strings.agent.agentChatTranscriptFolderWriteFailed
          : strings.agent.agentChatTranscriptSyncFailed;

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canChat || chatLoading) return;
    onSendMessage?.({
      text,
      contextMode,
      contextCards,
    });
    setDraft('');
  };

  const handleSaveKey = async (e) => {
    e.preventDefault();
    setApiKeyFeedback(null);
    const key = apiKeyDraft.trim();
    if (!key) {
      setApiKeyFeedback({ type: 'error', message: strings.agent.apiKeyRequired });
      return;
    }
    if (!activeConnector?.provider) {
      setApiKeyFeedback({ type: 'error', message: strings.agent.apiKeyConnectorUnavailable });
      return;
    }
    if (!secretsConfigured) {
      setApiKeyFeedback({ type: 'error', message: strings.agent.secretsNotConfigured });
      return;
    }
    try {
      await onSaveApiKey?.(activeConnector.provider, key);
      setApiKeyDraft('');
      setShowReplaceKey(false);
      setApiKeyFeedback({ type: 'success', message: strings.agent.apiKeySaved });
    } catch (err) {
      setApiKeyFeedback({
        type: 'error',
        message: err?.message || strings.agent.apiKeySaveFailed,
      });
    }
  };

  return (
    <div
      className={`flex flex-col min-h-0 overflow-hidden bg-surface ${className}`.trim()}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden />
          <span className="sans text-xs uppercase tracking-wider text-primary font-medium">
            {strings.agent.title}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted hover:text-primary rounded"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex flex-1 flex-col min-h-0 overflow-hidden gap-2 px-2.5 py-2 bg-canvas/40">
        <AgentPanelSection
          variant="setup"
          title={strings.agent.panelSectionSetup}
          className="shrink-0"
          bodyClassName="!space-y-1.5"
          collapsible
          collapsed={collapsedSections.setup}
          onToggleCollapsed={() => toggleSectionCollapsed('setup')}
          collapsedSummary={setupCollapsedSummary}
        >
        {!panelModeLocked && (
          <label className="block">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.agent.modeLabel}
            </span>
            <select
              className="mt-0.5 w-full sans text-xs bg-surface border border-border rounded px-2 py-1 text-primary"
              value={panelMode}
              onChange={(e) => onPanelModeChange?.(e.target.value)}
            >
              <option value="multi">{strings.agent.modeMultiAgent}</option>
              <option value="single">{strings.agent.modeSingleAgent}</option>
            </select>
          </label>
        )}

        {isSingle ? (
          <>
            <section>
              <span className="sans text-[10px] uppercase tracking-wider text-muted block mb-1">
                {strings.agent.connectorHeading}
              </span>
              <ul className="space-y-1">
                {CONNECTORS.map((connector) => {
                  const meta = connectors.find((c) => c.id === connector.id);
                  const selected = singleConnectorId === connector.id;
                  return (
                    <li key={connector.id}>
                      <button
                        type="button"
                        onClick={() => onSingleConnectorChange?.(connector.id)}
                        className={`w-full text-left rounded border px-2 py-1.5 transition ${
                          selected
                            ? 'border-accent bg-accent/10'
                            : 'border-border-subtle hover:border-border'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full border shrink-0 ${
                              selected ? 'border-accent bg-accent' : 'border-muted'
                            }`}
                          />
                          <span className="sans text-xs text-primary">{connector.label}</span>
                          {meta?.usable && (
                            <span className="sans text-[9px] text-muted ml-auto">Ready</span>
                          )}
                          {meta?.configured && !meta?.usable && meta?.requiresCredential !== false && (
                            <span className="sans text-[9px] text-warning ml-auto">Re-save key</span>
                          )}
                          {meta?.configured && !meta?.usable && meta?.requiresCredential === false && (
                            <span className="sans text-[9px] text-warning ml-auto">Unavailable</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <AgentTemplateConfigurator
              templates={agentTemplates}
              activeTemplateId={activeAgentTemplateId}
              selectedProvider={activeConnector?.provider || 'openai'}
              activeThread={activeAgentThread}
              threadTemplate={threadAgentTemplate}
              selectedDiffersFromThread={selectedAgentTypeDiffersFromThread}
              threadCompatible={activeThreadAgentTypeCompatible}
              threadNeedsDefaultAgentType={selectedThreadNeedsDefaultAgentType}
              onTemplateChange={onAgentTemplateChange}
              onSaveTemplate={onSaveAgentTemplate}
              onDeleteTemplate={onDeleteAgentTemplate}
              onImportMasterTemplates={onImportMasterAgentTemplates}
              onApplyAgentTypeToThread={onApplyAgentTypeToActiveThread}
              onUseDefaultAgentTypeForThread={onUseDefaultAgentTypeForActiveThread}
            />

            {connectorRequiresCredential ? (
              <section className="space-y-1">
                <div className="flex items-center justify-between gap-2 min-h-7">
                  <span className="sans text-[10px] uppercase tracking-wider text-muted shrink-0">
                    {strings.agent.apiKeyHeading}
                  </span>
                  {connectorConfigured && !showReplaceKey ? (
                    <ApiKeyPillMenu
                      keyHint={activeConnector.keyHint}
                      showReplaceForm={false}
                      onReplace={() => setShowReplaceKey(true)}
                      onRemove={() => onClearApiKey?.(activeConnector.provider)}
                      onCancelReplace={() => {
                        setShowReplaceKey(false);
                        setApiKeyDraft('');
                        setApiKeyFeedback(null);
                      }}
                      apiKeyDraft={apiKeyDraft}
                      onApiKeyDraftChange={setApiKeyDraft}
                      onSaveKey={handleSaveKey}
                      apiKeySaving={apiKeySaving}
                      apiKeyFeedback={apiKeyFeedback}
                    />
                  ) : null}
                </div>
                {connectorsOffline && (
                  <p className="sans text-[10px] text-warning leading-snug">
                    {strings.agent.apiOffline}
                  </p>
                )}
                {!secretsConfigured && (
                  <p className="sans text-[10px] text-warning leading-snug">
                    {strings.agent.secretsNotConfigured}
                  </p>
                )}
                {connectorConfigured && !connectorUsable && secretsConfigured && (
                  <p className="sans text-[10px] text-warning leading-snug">
                    {strings.agent.credentialNotUsable}
                  </p>
                )}
                {connectorConfigured && showReplaceKey ? (
                  <ApiKeyPillMenu
                    keyHint={activeConnector.keyHint}
                    showReplaceForm
                    onReplace={() => setShowReplaceKey(true)}
                    onRemove={() => onClearApiKey?.(activeConnector.provider)}
                    onCancelReplace={() => {
                      setShowReplaceKey(false);
                      setApiKeyDraft('');
                      setApiKeyFeedback(null);
                    }}
                    apiKeyDraft={apiKeyDraft}
                    onApiKeyDraftChange={setApiKeyDraft}
                    onSaveKey={handleSaveKey}
                    apiKeySaving={apiKeySaving}
                    apiKeyFeedback={apiKeyFeedback}
                  />
                ) : null}
                {!connectorConfigured ? (
                  <form onSubmit={handleSaveKey} className="flex items-center gap-1.5">
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      placeholder={strings.agent.apiKeyPlaceholder}
                      className="flex-1 min-w-0 sans text-xs bg-surface border border-border rounded-full px-2.5 py-1 text-primary"
                    />
                    <button
                      type="submit"
                      disabled={!apiKeyDraft.trim() || apiKeySaving}
                      className="sans text-[10px] bg-accent text-on-accent px-2.5 py-1 rounded-full disabled:opacity-40 shrink-0"
                    >
                      {apiKeySaving ? strings.agent.apiKeySaving : strings.agent.apiKeySave}
                    </button>
                  </form>
                ) : null}
                {apiKeyFeedback && !connectorConfigured && (
                  <p
                    className={`sans text-[10px] ${
                      apiKeyFeedback.type === 'success' ? 'text-success' : 'text-danger'
                    }`}
                    role="status"
                  >
                    {apiKeyFeedback.message}
                  </p>
                )}
                {!connectorConfigured && secretsConfigured && (
                  <p className="sans text-[10px] text-muted">{strings.agent.apiKeyMissing}</p>
                )}
              </section>
            ) : (
              <section className="space-y-1">
                {connectorsOffline && (
                  <p className="sans text-[10px] text-warning leading-snug" role="status">
                    {strings.agent.apiOffline}
                  </p>
                )}
                <p
                  className={`sans text-[10px] leading-snug ${
                    connectorUsable ? 'text-muted' : 'text-warning'
                  }`}
                  role="status"
                >
                  {connectorUsable
                    ? strings.agent.localAgentReady
                    : connectorsOffline
                      ? strings.agent.apiOffline
                      : activeConnector?.healthError || strings.agent.localAgentUnavailable}
                </p>
                {!connectorUsable && onRetryConnectors && (
                  <button
                    type="button"
                    className="sans text-[10px] text-link hover:text-link-hover hover:underline"
                    onClick={() => void onRetryConnectors()}
                  >
                    {strings.agent.retryConnectors}
                  </button>
                )}
              </section>
            )}

            {activeConnector?.provider === 'openai' && connectorConfigured && openaiReachable === false && (
              <p className="sans text-[10px] text-warning mb-2" role="status">
                {openaiReachabilityError || strings.agent.openaiUnreachable}
              </p>
            )}

          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="sans text-[10px] uppercase tracking-wider text-muted">
                {strings.agent.agentsHeading(enabledAgents.length)}
              </span>
              <button
                type="button"
                className="sans text-[10px] text-link hover:text-link-hover hover:underline"
                onClick={() => onComingSoon?.()}
              >
                {strings.agent.addAgent}
              </button>
            </div>
            <ul className="space-y-2">
              {AGENT_PROFILES.map((agent) => {
                const on = enabledAgentIds.has(agent.id);
                return (
                  <li
                    key={agent.id}
                    className="flex items-start gap-2 rounded border border-border-subtle px-2 py-2"
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => onToggleAgent(agent.id)}
                      className={`mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${
                        on ? 'border-accent bg-accent/20' : 'border-border'
                      }`}
                    >
                      {on && <span className={`w-1.5 h-1.5 rounded-full ${agent.dotClass}`} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agent.dotClass}`} />
                        <span className="sans text-xs text-primary">{agent.label}</span>
                      </div>
                      <p className="sans text-[10px] text-muted mt-0.5">{agent.description}</p>
                    </div>
                    <button
                      type="button"
                      className="p-1 text-muted hover:text-secondary shrink-0"
                      aria-label="Agent settings"
                      onClick={() => onComingSoon?.()}
                    >
                      <SlidersHorizontal size={12} strokeWidth={1.5} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {messages.length > 0 && (
              <ul className="space-y-2 max-h-32 overflow-y-auto mt-4">
                {messages.map((m, i) => (
                  <li
                    key={i}
                    className="sans text-xs text-secondary bg-surface-muted rounded px-2 py-1.5"
                  >
                    <p>{m.text}</p>
                    {m.contextMode != null && (
                      <p className="text-[10px] text-muted mt-1">
                        {strings.agent.contextMessageSummary(
                          m.contextMode,
                          m.contextLabels?.length ?? 0,
                          m.contextLabels ?? [],
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        </AgentPanelSection>

        <AgentPanelSection
          variant="context"
          title={strings.agent.contextHeading}
          className="shrink-0 max-h-[28vh] flex flex-col overflow-hidden"
          bodyClassName="overflow-y-auto min-h-0 flex-1 !space-y-1.5"
          collapsible
          collapsed={collapsedSections.context}
          onToggleCollapsed={() => toggleSectionCollapsed('context')}
        >
          {folderNeedsConnect && (
            <p className="sans text-[10px] text-warning mb-1 leading-snug">
              {connectedFolderName
                ? strings.agent.contextConnectFolderNamed(connectedFolderName)
                : strings.agent.contextConnectFolder}
            </p>
          )}
          {folderNeedsReconnect && (
            <p className="sans text-[10px] text-warning mb-1 leading-snug">
              {connectedFolderName
                ? strings.agent.contextReconnectFolderNamed(connectedFolderName)
                : strings.agent.contextReconnectFolder}
            </p>
          )}
          {isSingle &&
            contextEstimates.some(
              (e) => e.wouldTruncateUnlessExtended && !agentExtendedContext,
            ) && (
              <p className="sans text-[10px] text-warning mb-1 leading-snug" role="status">
                {contextEstimates
                  .filter((e) => e.wouldTruncateUnlessExtended && !agentExtendedContext)
                  .map((e) =>
                    e.pdfPagesTotal != null
                      ? strings.agent.contextLargeFileWarning(
                          e.label,
                          e.pdfPagesTotal,
                          contextProfileLimits?.pdfMaxPages ?? 40,
                        )
                      : `“${e.label}” may be truncated in standard mode.`,
                  )
                  .join(' ')}
              </p>
            )}
          {isSingle && lastTokenEstimate && (
            <p className="sans text-[10px] text-muted mb-1 leading-snug" role="status">
              {strings.agent.contextTokenEstimate(
                lastTokenEstimate.inputTokens,
                lastTokenEstimate.estimatedInputUsd ?? 0,
              )}
            </p>
          )}
          {isSingle && chatLoading && !lastTokenEstimate && (
            <p className="sans text-[10px] text-muted mb-1 italic leading-snug">
              {strings.agent.contextTokenEstimateLoading}
            </p>
          )}
          {isSingle && (
            <ContextPendingBanners
              deliveryState={contextDeliveryState}
              contextEstimates={contextEstimates}
            />
          )}
          {isSingle && onRefreshContextSession && !artifactScoped && (
            <button
              type="button"
              className="sans text-[10px] text-link hover:underline mb-1"
              onClick={() => onRefreshContextSession()}
            >
              {strings.agent.contextRefresh}
            </button>
          )}
          <div className="space-y-1.5">
            {artifactScoped ? (
              <div className="w-full rounded-md border border-success-border bg-success-muted px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full border border-primary bg-primary shrink-0" />
                  <span className="sans text-[11px] text-primary">
                    {strings.agent.contextArtifact}
                  </span>
                </div>
                <p className="sans text-[9px] text-muted mt-0.5 ml-3 leading-snug">
                  {strings.agent.contextArtifactHint}
                </p>
                {contextCards.length > 0 && (
                  <>
                    <p className="sans text-[9px] uppercase tracking-wider text-muted mt-1 ml-3">
                      {strings.agent.contextListHeading}
                    </p>
                    <ContextCardList
                      cards={contextCards}
                      statusByCardId={contextStatusByCardId}
                      deliveryByCardId={contextDeliveryByCardId}
                    />
                  </>
                )}
              </div>
            ) : flowScoped ? (
              <div className="w-full rounded-md border border-success-border bg-success-muted px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full border border-primary bg-primary shrink-0" />
                  <span className="sans text-[11px] text-primary">
                    {strings.agent.contextFlow}
                  </span>
                </div>
                <p className="sans text-[9px] text-muted mt-0.5 ml-3 leading-snug">
                  {strings.agent.contextFlowHint}
                </p>
                <p className="sans text-[9px] text-muted mt-0.5 ml-3 leading-snug">
                  {strings.agent.contextFlowSendHint}
                </p>
                <p className="sans text-[9px] text-muted mt-1 ml-3 leading-snug">
                  {flowSelectionSummary?.isFullFlow
                    ? strings.agent.contextFlowFullDiagram
                    : strings.agent.contextFlowSelectionSummary(
                        flowSelectionSummary?.nodeCount ?? 0,
                        flowSelectionSummary?.edgeCount ?? 0,
                      )}
                </p>
                <label className="sans mt-2 ml-3 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flowIncludeNetwork}
                    onChange={(event) => onFlowIncludeNetworkChange?.(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-[10px] text-primary">
                    {strings.agent.contextFlowIncludeNetwork}
                  </span>
                </label>
                {contextCards.length > 0 && (
                  <>
                    <p className="sans text-[9px] uppercase tracking-wider text-muted mt-2 ml-3">
                      {strings.agent.contextListHeading}
                    </p>
                    <ContextCardList
                      cards={contextCards}
                      statusByCardId={contextStatusByCardId}
                      deliveryByCardId={contextDeliveryByCardId}
                    />
                  </>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onContextModeChange('visible')}
                  className={`w-full text-left rounded-md border px-2 py-1.5 transition ${
                    contextMode === 'visible'
                      ? 'border-border bg-surface-muted'
                      : 'border-border-subtle hover:border-border'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full border shrink-0 ${
                        contextMode === 'visible' ? 'border-primary bg-primary' : 'border-muted'
                      }`}
                    />
                    <span className="sans text-[11px] text-primary">{strings.agent.contextVisible}</span>
                  </div>
                  <p className="sans text-[9px] text-muted mt-0.5 ml-3 leading-snug">
                    {strings.agent.contextVisibleHint}
                    {contextMode === 'visible' ? ` (${contextCards.length})` : ''}
                  </p>
                  {contextMode === 'visible' && contextCards.length > 0 && (
                    <>
                      <p className="sans text-[9px] uppercase tracking-wider text-muted mt-1 ml-3">
                        {strings.agent.contextListHeading}
                      </p>
                      <ContextCardList
                        cards={contextCards}
                        statusByCardId={contextStatusByCardId}
                        deliveryByCardId={contextDeliveryByCardId}
                      />
                    </>
                  )}
                </button>
                <div
                  className={`w-full rounded-md border px-2 py-1.5 transition ${
                    contextMode === 'selected'
                      ? contextCards.length > 0
                        ? 'border-success-border bg-success-muted'
                        : 'border-border bg-surface-muted'
                      : 'border-border-subtle hover:border-border'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onContextModeChange('selected')}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full border shrink-0 ${
                          contextMode === 'selected' ? 'border-primary bg-primary' : 'border-muted'
                        }`}
                      />
                      <span className="sans text-[11px] text-primary">{strings.agent.contextSelected}</span>
                    </div>
                    <p className="sans text-[9px] text-muted mt-0.5 ml-3 leading-snug">
                      {strings.agent.contextSelectedHint(
                        contextMode === 'selected' ? contextCards.length : selectedCount,
                      )}
                    </p>
                  </button>
                  {contextMode === 'selected' && contextCards.length === 0 && (
                    <p className="sans text-[9px] text-muted/80 mt-0.5 ml-3 italic leading-snug">
                      {agentSelectionClick
                        ? strings.agent.contextSelectedEmpty
                        : strings.agent.contextSelectedEmptyShift}
                    </p>
                  )}
                  {contextMode === 'selected' && contextCards.length > 0 && (
                    <>
                      <p className="sans text-[9px] uppercase tracking-wider text-muted mt-1 ml-3">
                        {strings.agent.contextListHeading}
                      </p>
                      <ContextCardList
                        cards={contextCards}
                        statusByCardId={contextStatusByCardId}
                        deliveryByCardId={contextDeliveryByCardId}
                        onRemoveCard={onRemoveContextCard}
                        showRemoveControls
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {isSingle && (
            <label className="flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-border-subtle cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={agentExtendedContext}
                onChange={(e) => onAgentExtendedContextChange?.(e.target.checked)}
              />
              <span className="min-w-0 leading-snug">
                <span className="sans text-[11px] text-primary block">
                  {strings.agent.contextExtendedLabel}
                </span>
                <span className="sans text-[9px] text-muted block">
                  {strings.agent.contextExtendedHint}
                </span>
              </span>
            </label>
          )}
        </AgentPanelSection>

      {isSingle && (
        <AgentPanelSection
          variant="chat"
          title={strings.agent.panelSectionConversation}
          className="flex flex-1 flex-col min-h-0 overflow-hidden"
          bodyClassName="flex flex-1 flex-col min-h-0 overflow-hidden !py-1.5 !space-y-0"
        >
        <AgentThreadSection
          embedded
          threads={chatThreads}
          activeThreadId={activeThreadId}
          activeThreadTitle={activeThreadTitle}
          threadPickerOpen={threadPickerOpen}
          onSelectThread={onSelectThread}
          onCreateThread={onCreateThread}
          onRenameThread={onRenameThread}
          onSwitchThread={onSwitchThread}
          onDeleteThread={onDeleteThread}
        />
        <div className="flex flex-1 min-h-0 flex-col border-t border-border mt-1 pt-1">
          {(chatPersistTrimmed || chatArtifactSyncFailed) && (
            <div className="shrink-0 space-y-0.5 px-3 pt-2">
              {chatPersistTrimmed && (
                <p className="sans text-[10px] text-warning" role="status">
                  {strings.agent.agentChatPersistTrimmed}
                </p>
              )}
              {chatArtifactSyncFailed && (
                <p className="sans text-[10px] text-warning" role="status">
                  {chatSyncFailedMessage}
                </p>
              )}
            </div>
          )}
          <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 py-1 border-b border-border-subtle">
            <span className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.agent.chatHeading}
            </span>
            {chatArtifactRef?.id && onOpenChatArtifact && (
              <button
                type="button"
                className="sans text-[10px] text-link hover:underline"
                onClick={() => onOpenChatArtifact(chatArtifactRef.id)}
              >
                {strings.agent.agentChatViewTranscript}
              </button>
            )}
            {chatArtifactSyncFailed && onRetryChatSync && chatMessages.length > 0 && (
              <button
                type="button"
                className="sans text-[10px] text-link hover:underline disabled:opacity-50"
                disabled={chatSyncRetrying}
                onClick={() => onRetryChatSync()}
              >
                {chatSyncRetrying
                  ? strings.agent.contextTokenEstimateLoading
                  : strings.agent.agentChatRetrySync}
              </button>
            )}
            {onClearChat && activeThreadId && chatMessages.length > 0 && (
              <button
                type="button"
                className="sans text-[10px] text-muted hover:text-danger"
                onClick={() => onClearChat()}
              >
                {strings.agent.agentChatClear}
              </button>
            )}
          </div>
          <ThreadContextBar
            cards={contextCards}
            deliveryByCardId={contextDeliveryByCardId}
            onFocusCard={onFocusContextCard}
          />
          <AgentChatThreadView
            messages={chatMessages}
            loading={chatLoading}
            error={chatError}
            className="flex-1"
            defaultAgentTypeLabel={
              activeAgentThread?.agentTypeLabel
              || threadAgentTemplate?.label
              || defaultAgentTypeLabelForProvider(activeConnector?.provider)
            }
          />
        </div>
        <footer className="shrink-0 border-t border-border mt-1.5 pt-1.5 space-y-1">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isSingle && !canChat
                ? chatDisabledMessage
                : strings.agent.inputPlaceholder
            }
            rows={5}
            disabled={isSingle && !canChat}
            className="w-full sans text-xs bg-surface-muted border border-border rounded-lg pl-9 pr-10 py-2 text-primary resize-none focus:outline-none focus:border-accent/50 disabled:opacity-50"
          />
          <button
            type="button"
            className="absolute left-2 bottom-2 p-1 text-muted hover:text-secondary"
            aria-label="Attach"
            onClick={() => onComingSoon?.()}
          >
            <Paperclip size={14} strokeWidth={1.5} />
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || (isSingle && (!canChat || chatLoading))}
            className="absolute right-2 bottom-2 p-1.5 rounded-full bg-accent text-canvas disabled:opacity-40"
            aria-label={strings.agent.send}
          >
            <Send size={14} strokeWidth={1.5} />
          </button>
        </form>
        <p className="sans text-[9px] text-muted text-center">{strings.agent.disclaimer}</p>
        </footer>
        </AgentPanelSection>
      )}

      {!isSingle && (
      <footer className="shrink-0 border-t border-border px-4 py-3 space-y-2">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={strings.agent.inputPlaceholder}
            rows={5}
            className="w-full sans text-xs bg-surface-muted border border-border rounded-lg pl-9 pr-10 py-2 text-primary resize-none focus:outline-none focus:border-accent/50"
          />
          <button
            type="button"
            className="absolute left-2 bottom-2 p-1 text-muted hover:text-secondary"
            aria-label="Attach"
            onClick={() => onComingSoon?.()}
          >
            <Paperclip size={14} strokeWidth={1.5} />
          </button>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="absolute right-2 bottom-2 p-1.5 rounded-full bg-accent text-canvas disabled:opacity-40"
            aria-label={strings.agent.send}
          >
            <Send size={14} strokeWidth={1.5} />
          </button>
        </form>
        <p className="sans text-[9px] text-muted text-center">{strings.agent.disclaimer}</p>
      </footer>
      )}
      </div>
    </div>
  );
}
