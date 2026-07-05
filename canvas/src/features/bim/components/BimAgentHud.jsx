import React from 'react';
import { Bot } from 'lucide-react';
import { CONNECTORS } from '../../../lib/agentConnectors.js';
import { BimAgentResponsePanel } from './BimQueryPanel.jsx';
import { BIM_AGENT_INFO, LOCAL_BIM_RULES_RESPONDER_ID } from './bimAgentPanelShared.js';

export function BimAgentHud({
  agentText,
  onAgentTextChange,
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
  return (
    <div
      className="pointer-events-auto w-full rounded-md border border-border bg-surface/95 p-2.5 shadow-lg backdrop-blur-sm"
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

      <div className="flex items-center gap-1.5">
        <input
          value={agentText}
          onChange={(event) => onAgentTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onAskSelectedResponder();
          }}
          className="min-w-0 flex-1 rounded border border-border bg-preview-bg px-1.5 py-1 text-[11px] text-primary outline-none"
          aria-label="BIM agent request"
          placeholder="Ask BIM"
        />
        <select
          aria-label="BIM ask responder"
          value={responderId}
          onChange={(event) => onResponderIdChange(event.target.value)}
          className="w-32 rounded border border-border bg-preview-bg px-1.5 py-1 text-[11px] text-secondary outline-none"
        >
          <option value={LOCAL_BIM_RULES_RESPONDER_ID}>Local BIM Rules</option>
          {CONNECTORS.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAskSelectedResponder}
          disabled={agentRunState.status === 'running'}
          className="inline-flex shrink-0 items-center justify-center rounded border border-border bg-accent p-1.5 text-on-accent disabled:opacity-40"
          title="Ask selected BIM responder"
          aria-label="Ask selected BIM responder"
        >
          <Bot size={14} strokeWidth={1.8} />
        </button>
      </div>

      {selectedConnector && providerStatus.status !== 'ready' && (
        <div className="mt-1.5 text-[10px] text-warning">{providerStatus.message}</div>
      )}

      {agentResponse && (
        <div className="mt-2">
          <BimAgentResponsePanel response={agentResponse} compact />
        </div>
      )}

      {statusLine && (
        <div className="mt-1.5 truncate text-[10px] text-muted">{statusLine}</div>
      )}
    </div>
  );
}
