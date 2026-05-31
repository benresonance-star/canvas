import React, { useEffect, useRef, useState } from 'react';
import { FileText, FileX, ChevronDown, ChevronUp } from 'lucide-react';
import { strings } from '../content/strings.js';

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
                <p className="mt-1 text-[10px] text-muted whitespace-pre-wrap line-clamp-6">
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

export function hasConversationMessages(messages) {
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
}) {
  const bottomRef = useRef(null);
  const textSize = compact ? 'text-[10px]' : 'text-xs';
  const padX = compact ? 'px-2 py-1' : 'px-3 py-2';
  const sidePad = compact ? 'pl-3 pr-3' : 'pl-6 pr-6';

  useEffect(() => {
    if (!scrollOnUpdate) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading, error, scrollOnUpdate]);

  const showEmpty =
    !hasConversationMessages(messages) && !loading && !error;

  return (
    <div
      className={`flex flex-col min-h-0 overflow-y-auto gap-2 ${compact ? 'px-1 py-1' : 'px-3 py-2'} ${className}`}
    >
      {showEmpty && (
        <p className={`sans text-muted text-center ${compact ? 'py-3 text-[10px]' : 'py-6 text-xs'} px-2`}>
          {strings.agent.chatEmptyHint}
        </p>
      )}
      {messages.map((m) => {
        if (m.kind === 'context_add' || m.kind === 'context_remove') {
          return <ContextEventRow key={m.id} message={m} compact={compact} />;
        }
        const isUser = m.role === 'user';
        return (
          <div
            key={m.id}
            className={`flex flex-col max-w-full ${isUser ? `items-end ${sidePad}` : `items-start ${sidePad}`}`}
          >
            <div
              className={`sans ${textSize} rounded-lg ${padX} max-w-full whitespace-pre-wrap ${
                isUser
                  ? 'bg-surface-muted border border-border text-primary rounded-br-md'
                  : 'bg-surface border border-border-subtle text-secondary rounded-bl-md'
              }`}
            >
              {m.content}
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
