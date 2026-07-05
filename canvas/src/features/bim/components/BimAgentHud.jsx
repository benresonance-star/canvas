import React from 'react';
import { ArrowUp, Bot } from 'lucide-react';
import { CONNECTORS } from '../../../lib/agentConnectors.js';
import { BimAgentResponsePanel } from './BimQueryPanel.jsx';
import { BIM_AGENT_INFO, LOCAL_BIM_RULES_RESPONDER_ID } from './bimAgentPanelShared.js';

function BimAgentChatMessage({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[92%] rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] text-primary">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>
    );
  }

  const isRunning = message.status === 'running';
  const isError = message.status === 'error';
  const showResponsePanel = message.response && !isRunning;
  return (
    <div className="flex justify-start">
      <div className={`max-w-[92%] rounded-md border px-2 py-1.5 text-[11px] ${
        isError ? 'border-warning/50 bg-warning/10 text-primary' : 'border-border bg-surface text-primary'
      }`}
      >
        {!showResponsePanel && (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}
        {isRunning && message.content !== 'Thinking...' && (
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted">Running</div>
        )}
        {showResponsePanel && (
          <BimAgentResponsePanel response={message.response} compact />
        )}
      </div>
    </div>
  );
}

export function BimAgentHud({
  agentText,
  onAgentTextChange,
  chatMessages = [],
  responderId,
  onResponderIdChange,
  selectedResponderLabel,
  responderLabel,
  providerStatus,
  agentRunState,
  agentResponse,
  statusLine,
  onAskSelectedResponder,
  onRefreshAgentProviderState,
  selectedConnector,
}) {
  const transcript = chatMessages.length > 0
    ? chatMessages
    : (agentResponse
      ? [
          ...(agentResponse.question
            ? [{ id: 'legacy-user', role: 'user', content: agentResponse.question }]
            : []),
          {
            id: 'legacy-assistant',
            role: 'assistant',
            content: agentResponse.answer || agentResponse.workSummary || 'No answer yet.',
            response: agentResponse,
            status: agentResponse.status,
          },
        ]
      : []);

  const handleSend = () => {
    if (agentRunState.status === 'running') return;
    onAskSelectedResponder();
  };

  return (
    <div
      className="pointer-events-auto flex w-full min-h-[22rem] max-h-[min(32rem,calc(100vh-5rem))] flex-col rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
      aria-label="BIM Evidence Agent"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
          <Bot size={12} strokeWidth={1.8} aria-hidden />
          <span className="text-secondary">{BIM_AGENT_INFO.name}</span>
        </div>
        <button
          type="button"
          onClick={onRefreshAgentProviderState}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary hover:bg-surface-muted"
          title="Refresh BIM responder status"
        >
          Status
        </button>
      </div>

      <div className="mb-2 flex flex-col gap-0.5 text-[10px] text-muted">
        <span className="truncate">Model: {BIM_AGENT_INFO.model}</span>
        <span className="truncate">Mode: {selectedResponderLabel}</span>
        <span className="truncate">Responder: {responderLabel}</span>
        <span className={providerStatus.status === 'ready' ? 'truncate text-secondary' : 'truncate text-warning'}>
          Provider status: {providerStatus.label}
        </span>
        <span className="truncate">Source: {BIM_AGENT_INFO.source}</span>
      </div>

      <select
        aria-label="BIM ask responder"
        value={responderId}
        onChange={(event) => onResponderIdChange(event.target.value)}
        className="mb-2 w-full rounded border border-border bg-preview-bg px-1.5 py-1 text-[11px] text-secondary outline-none"
      >
        <option value={LOCAL_BIM_RULES_RESPONDER_ID}>Local BIM Rules</option>
        {CONNECTORS.map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label}</option>
        ))}
      </select>

      <div className="mb-2 flex flex-col gap-1.5">
        <textarea
          value={agentText}
          onChange={(event) => onAgentTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          rows={3}
          className="min-h-[4.5rem] w-full resize-y overflow-y-auto rounded border border-border bg-preview-bg px-1.5 py-1 text-[11px] leading-snug text-primary outline-none"
          aria-label="BIM agent request"
          placeholder="Ask BIM"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSend}
            disabled={agentRunState.status === 'running'}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-accent text-on-accent disabled:opacity-40"
            title="Send to model"
            aria-label="Send to model"
          >
            <ArrowUp size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="min-h-[8rem] flex-1 overflow-y-auto rounded border border-border bg-preview-bg/50 p-2">
        {transcript.length === 0 ? (
          <div className="text-[10px] text-muted">Ask a BIM question to start a conversation.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {transcript.map((message) => (
              <BimAgentChatMessage key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      {selectedConnector && providerStatus.status !== 'ready' && (
        <div className="mt-1.5 text-[10px] text-warning">{providerStatus.message}</div>
      )}

      {statusLine && (
        <div className="mt-1.5 truncate text-[10px] text-muted">{statusLine}</div>
      )}
    </div>
  );
}
