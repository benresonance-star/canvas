import React, { useMemo, useState, useRef, useEffect } from 'react';
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
  agentCanChat,
  getConnectorById,
  mergeConnectorMeta,
} from '../lib/agentConnectors.js';
import { AgentThreadSection } from './AgentThreadSection.jsx';
import { AgentChatThreadView } from './AgentChatThreadView.jsx';
import { cardLabel } from '../lib/agentContext.js';
import { ThreadContextBar } from './ThreadContextBar.jsx';

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
}) {
  return (
    <section
      className={`rounded-xl border overflow-hidden min-w-0 ${PANEL_SECTION_SHELL[variant] ?? PANEL_SECTION_SHELL.setup} ${className}`.trim()}
    >
      {title ? (
        <header
          className={`flex items-center gap-2 px-2.5 py-1.5 border-b shrink-0 ${PANEL_SECTION_HEADER[variant] ?? PANEL_SECTION_HEADER.setup}`}
        >
          <span className="w-1 h-3.5 rounded-full bg-accent shrink-0" aria-hidden />
          <span className="sans text-[10px] uppercase tracking-[0.14em] text-primary font-medium">
            {title}
          </span>
        </header>
      ) : null}
      <div className={`px-2.5 py-2 space-y-2 min-w-0 ${bodyClassName}`.trim()}>
        {children}
      </div>
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
  secretsConfigured = true,
  connectorsOffline = false,
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
  cards = [],
  contextCards = [],
  selectedCardIds,
  canvasView,
  viewportSize,
  onFocusContextCard,
  agentSelectionClick = false,
  onRemoveContextCard,
  onClose,
  onComingSoon,
  messages = [],
  onSendMessage,
  folderLinked = false,
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
}) {
  const [draft, setDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showReplaceKey, setShowReplaceKey] = useState(false);
  const [apiKeyFeedback, setApiKeyFeedback] = useState(null);
  const autoReplaceOpenedRef = useRef(false);

  const selectedCount = selectedCardIds?.size ?? 0;
  const enabledAgents = AGENT_PROFILES.filter((a) => enabledAgentIds.has(a.id));
  const isSingle = panelMode === 'single';
  const artifactScoped = contextScope === 'artifact';

  const connectorDef = getConnectorById(singleConnectorId) ?? CONNECTORS[0] ?? null;
  const connectorMeta = connectorDef
    ? connectors.find((c) => c.id === connectorDef.id)
    : null;
  const activeConnector = mergeConnectorMeta(connectorDef, connectorMeta);
  const connectorConfigured = Boolean(activeConnector?.configured);
  const connectorUsable = Boolean(activeConnector?.usable);
  const canChat =
    agentCanChat({
      panelMode,
      secretsConfigured,
      activeConnector,
    }) && Boolean(activeThreadId) && !threadPickerOpen;

  useEffect(() => {
    if (
      connectorMeta?.configured
      && !connectorMeta?.usable
      && secretsConfigured
      && !autoReplaceOpenedRef.current
    ) {
      setShowReplaceKey(true);
      autoReplaceOpenedRef.current = true;
    }
    if (connectorMeta?.usable) {
      autoReplaceOpenedRef.current = false;
    }
  }, [connectorMeta?.configured, connectorMeta?.usable, secretsConfigured]);

  const chatSyncFailedMessage =
    chatArtifactSyncReason === 'ingest_failed'
      ? strings.agent.agentChatTranscriptIngestFailed
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
                          {meta?.configured && !meta?.usable && (
                            <span className="sans text-[9px] text-warning ml-auto">Re-save key</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

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

            {connectorConfigured && openaiReachable === false && (
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
          />
        </div>
        <footer className="shrink-0 border-t border-border mt-1.5 pt-1.5 space-y-1">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              isSingle && !canChat
                ? strings.agent.apiKeyMissing
                : strings.agent.inputPlaceholder
            }
            rows={1}
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
            rows={2}
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
