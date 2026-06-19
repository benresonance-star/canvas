import React, { useEffect, useRef, useState } from 'react';
import { FileText, FileX, ChevronDown, ChevronUp } from 'lucide-react';
import { strings } from '../content/strings.js';
import { markdownViewToggleLabel } from '../lib/markdownMessage.js';
import { MarkdownMessage } from './MarkdownMessage.jsx';

function ContextEventRow({ message, compact }) {
  const [expanded, setExpanded] = useState(false);
  const isAdd = message.kind === 'context_add';
  const labels = message.labels?.join(', ') ?? '';
  const title = isAdd
    ? strings.agent.contextChatAddLabel(labels)
    : strings.agent.contextChatRemoveLabel(labels);

  return (
    <li
      className={`sans rounded px-2 py-1.5 bg-surface-muted text-muted border border-border-subtle ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {isAdd ? (
          <FileText size={compact ? 10 : 12} className="shrink-0 mt-0.5 text-muted" aria-hidden />
        ) : (
          <FileX size={compact ? 10 : 12} className="shrink-0 mt-0.5 text-muted" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className={compact ? 'text-[10px]' : 'text-[11px]'}>{title}</p>
          {isAdd && message.preview && !compact && (
            <>
              <button
                type="button"
                className="mt-1 flex items-center gap-0.5 text-[10px] text-link hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp size={10} /> Hide preview
                  </>
                ) : (
                  <>
                    <ChevronDown size={10} /> Show preview
                  </>
                )}
              </button>
              {expanded && (
                <p className="mt-1 text-[10px] text-muted whitespace-pre-wrap line-clamp-6 select-text">
                  {message.preview}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function AgentTypeChangeRow({ message, compact }) {
  const fromLabel = message.fromAgentTypeLabel || 'Default ChatGPT agent';
  const toLabel = message.toAgentTypeLabel || 'Default ChatGPT agent';
  const model = message.model ? ` · ${message.provider || 'provider'}/${message.model}` : '';
  return (
    <li
      className={`sans rounded px-2 py-1.5 bg-surface-muted text-muted border border-border-subtle text-center ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
    >
      Agent Type changed: {fromLabel} -&gt; {toLabel}{model}
    </li>
  );
}

function formatAgentTypeLabel({ label, provider, model }) {
  if (!label) return '';
  const modelRef = model?.includes('/')
    ? model
    : model
      ? `${provider || 'provider'}/${model}`
      : '';
  return modelRef ? `${label} · ${modelRef}` : label;
}

function resolveAgentAttribution(messages, index, defaultAgentTypeLabel = '') {
  const message = messages[index];
  if (message.role !== 'assistant') return '';

  let label = message.agentTypeLabel || message.agentTemplateId;
  let provider = message.provider;
  let model = message.model;

  if (!label) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = messages[i];
      if (prev.kind === 'agent_type_change') {
        label = prev.toAgentTypeLabel;
        break;
      }
      if (prev.role === 'assistant' && (prev.agentTypeLabel || prev.agentTemplateId)) {
        label = prev.agentTypeLabel || prev.agentTemplateId;
        provider = prev.provider;
        model = prev.model;
        break;
      }
    }
  }

  if (!label) label = defaultAgentTypeLabel;
  return formatAgentTypeLabel({ label, provider, model });
}

function hasConversationMessages(messages) {
  return (messages ?? []).some(
    (m) => !m.kind && (m.role === 'user' || m.role === 'assistant'),
  );
}

/**
 * Shared user/assistant chat bubbles (side panel + canvas agent_chat cards).
 */
export function AgentChatThreadView({
  messages = [],
  loading = false,
  error = null,
  compact = false,
  className = '',
  scrollOnUpdate = true,
  defaultAgentTypeLabel = '',
}) {
  const bottomRef = useRef(null);
  const [formattedView, setFormattedView] = useState(true);
  const textSize = compact ? 'text-[10px]' : 'text-xs';
  const padX = compact ? 'px-2 py-1' : 'px-3 py-2';
  const sidePad = compact ? 'pl-3 pr-3' : 'pl-6 pr-6';

  useEffect(() => {
    if (!scrollOnUpdate) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading, error, scrollOnUpdate]);

  const showEmpty =
    !hasConversationMessages(messages) && !loading && !error;
  const showViewToggle = hasConversationMessages(messages);

  return (
    <div
      className={`flex flex-col min-h-0 overflow-y-auto gap-2 ${compact ? 'px-1 py-1' : 'px-3 py-2'} ${className}`}
    >
      {showViewToggle && (
        <div className={`sticky top-0 z-10 flex justify-end ${compact ? 'px-1 pt-0.5' : 'px-1 pt-1'}`}>
          <button
            type="button"
            className={`sans rounded-full border border-border-subtle bg-surface-muted/90 text-muted shadow-sm hover:text-primary ${
              compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
            }`}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              setFormattedView((value) => !value);
            }}
            aria-pressed={!formattedView}
          >
            {markdownViewToggleLabel(formattedView)}
          </button>
        </div>
      )}
      {showEmpty && (
        <p className={`sans text-muted text-center ${compact ? 'py-3 text-[10px]' : 'py-6 text-xs'} px-2`}>
          {strings.agent.chatEmptyHint}
        </p>
      )}
      {messages.map((m, index) => {
        if (m.kind === 'context_add' || m.kind === 'context_remove') {
          return <ContextEventRow key={m.id} message={m} compact={compact} />;
        }
        if (m.kind === 'agent_type_change') {
          return <AgentTypeChangeRow key={m.id} message={m} compact={compact} />;
        }
        const isUser = m.role === 'user';
        const agentTypeLabel = !isUser
          ? resolveAgentAttribution(messages, index, defaultAgentTypeLabel)
          : '';
        return (
          <div
            key={m.id}
            className={`flex flex-col max-w-full ${isUser ? `items-end ${sidePad}` : `items-start ${sidePad}`}`}
          >
            <div
              className={`sans ${textSize} rounded-lg ${padX} max-w-full whitespace-pre-wrap select-text ${
                isUser
                  ? 'bg-surface-muted border border-border text-primary rounded-br-md'
                  : 'bg-surface border border-border-subtle text-secondary rounded-bl-md'
              }`}
            >
              {agentTypeLabel && (
                <p
                  className={`sans text-muted border-b border-border-subtle/70 pb-1 mb-1.5 ${
                    compact ? 'text-[9px]' : 'text-[10px]'
                  }`}
                >
                  {agentTypeLabel}
                </p>
              )}
              {formattedView ? (
                <MarkdownMessage content={m.content} compact={compact} />
              ) : (
                m.content
              )}
            </div>
          </div>
        );
      })}
      {loading && (
        <div className={`flex flex-col items-start ${sidePad}`}>
          <p className={`sans ${textSize} text-muted italic px-2 py-1`}>
            {strings.agent.chatThinking}
          </p>
        </div>
      )}
      {error && (
        <p className={`sans ${textSize} text-danger px-2 py-1.5 bg-danger-muted rounded border border-danger-border`}>
          {error}
        </p>
      )}
      <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
    </div>
  );
}
