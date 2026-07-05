import { useMemo, useState } from 'react';
import { DEFAULT_SINGLE_CONNECTOR_ID, getConnectorById } from '../../../lib/agentConnectors.js';
import { draftBqlFromNaturalLanguage } from '../bim-core/bimAgent.js';
import { buildBimAgentResponse } from '../bim-core/bimAgentResponse.js';
import {
  BIM_AGENT_INFO,
  LOCAL_BIM_RULES_RESPONDER_ID,
  friendlyProviderStatusMessage,
  prettyQuery,
} from '../components/bimAgentPanelShared.js';

export function useBimAgentPanel({
  onRunQuery,
  onRunLocalAgent,
  onRunLlmAgent,
  agentRunState = { status: 'idle', message: null, model: null, responderLabel: null },
  agentProviderState = { status: 'checking', message: 'Checking Canvas API.', connectors: [] },
  onApplyQueryDraft = () => {},
  initialResponderId = LOCAL_BIM_RULES_RESPONDER_ID,
}) {
  const [agentText, setAgentText] = useState('');
  const [agentFeedback, setAgentFeedback] = useState(null);
  const [agentResponse, setAgentResponse] = useState(null);
  const [responderId, setResponderId] = useState(initialResponderId);

  const selectedConnector = responderId === LOCAL_BIM_RULES_RESPONDER_ID
    ? null
    : getConnectorById(responderId) ?? getConnectorById(DEFAULT_SINGLE_CONNECTOR_ID);
  const selectedConnectorStatus = selectedConnector
    ? agentProviderState.connectors?.find((entry) => entry.id === selectedConnector.id)
    : null;
  const providerStatus = friendlyProviderStatusMessage({
    connector: selectedConnector,
    connectorStatus: selectedConnectorStatus,
    providerState: agentProviderState,
  });
  const selectedResponderLabel = selectedConnector
    ? `${selectedConnector.label}/${selectedConnector.model ?? 'not configured'}`
    : `Local BIM Rules/${BIM_AGENT_INFO.model}`;
  const responderLabel = agentRunState.responderLabel && agentRunState.model
    ? `${agentRunState.responderLabel}/${agentRunState.model}`
    : selectedResponderLabel;

  const applyQueryDraft = (query, { run = true } = {}) => {
    onApplyQueryDraft(prettyQuery(query), { query, run });
  };

  const askAgent = () => {
    const selectedResponder = `Local BIM Rules/${BIM_AGENT_INFO.model}`;
    if (onRunLocalAgent) {
      const draft = onRunLocalAgent(agentText);
      if (!draft.ok) {
        setAgentFeedback(draft.warnings.join(' '));
        setAgentResponse(buildBimAgentResponse({
          question: agentText,
          selectedResponder,
          actualResponder: selectedResponder,
          status: 'error',
          workSummary: 'Local rules could not map the request',
          warnings: draft.warnings,
          providerStatus: 'ready',
          providerStatusMessage: 'Local BIM Rules ready.',
          semanticResolution: draft.semanticResolution,
        }));
        return;
      }
      applyQueryDraft(draft.query, { run: false });
      setAgentFeedback(draft.intentSummary);
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: draft.result?.status === 'error' ? 'error' : 'ready',
        workSummary: draft.workSummary ?? 'Local rules drafted BQL',
        warnings: draft.result?.warnings ?? draft.warnings ?? [],
        query: draft.query,
        result: draft.result,
        providerStatus: 'ready',
        providerStatusMessage: 'Local BIM Rules ready.',
        semanticResolution: draft.semanticResolution,
      }));
      return;
    }
    const draft = draftBqlFromNaturalLanguage(agentText);
    if (!draft.ok) {
      setAgentFeedback(draft.warnings.join(' '));
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: 'error',
        workSummary: 'Local rules could not map the request',
        warnings: draft.warnings,
        providerStatus: 'ready',
        providerStatusMessage: 'Local BIM Rules ready.',
        semanticResolution: draft.semanticResolution,
      }));
      return;
    }
    applyQueryDraft(draft.query, { run: true });
    setAgentFeedback(draft.intentSummary);
    const result = onRunQuery(draft.query);
    setAgentResponse(buildBimAgentResponse({
      question: agentText,
      selectedResponder,
      actualResponder: selectedResponder,
      status: result?.status === 'error' ? 'error' : 'ready',
      workSummary: 'Local rules drafted BQL',
      warnings: result?.warnings ?? [],
      query: draft.query,
      result,
      providerStatus: 'ready',
      providerStatusMessage: 'Local BIM Rules ready.',
      semanticResolution: draft.semanticResolution,
    }));
  };

  const answerWithLocalFallback = ({
    selectedResponder,
    providerStatus: currentProviderStatus,
    workSummary = 'Provider did not run; local rules answered',
  }) => {
    const fallback = onRunLocalAgent ? onRunLocalAgent(agentText) : draftBqlFromNaturalLanguage(agentText);
    if (!fallback.ok) {
      setAgentFeedback(currentProviderStatus.message);
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: 'error',
        workSummary: 'Provider did not run; local rules could not map the request',
        warnings: [currentProviderStatus.message, ...(fallback.warnings ?? [])],
        providerStatus: currentProviderStatus.status,
        providerStatusMessage: currentProviderStatus.message,
        didProviderRun: false,
        semanticResolution: fallback.semanticResolution,
      }));
      return;
    }
    applyQueryDraft(fallback.query, { run: !(fallback.result || onRunLocalAgent) });
    const result = fallback.result ?? onRunQuery(fallback.query);
    setAgentFeedback(`${workSummary}. ${currentProviderStatus.message}`);
    setAgentResponse(buildBimAgentResponse({
      question: agentText,
      selectedResponder,
      actualResponder: `Local BIM Rules/${BIM_AGENT_INFO.model}`,
      status: 'fallback',
      workSummary,
      warnings: [currentProviderStatus.message, ...(fallback.warnings ?? []), ...(result?.warnings ?? [])],
      query: fallback.query,
      result,
      providerStatus: currentProviderStatus.status,
      providerStatusMessage: currentProviderStatus.message,
      didProviderRun: false,
      fallbackUsed: true,
      semanticResolution: fallback.semanticResolution,
    }));
  };

  const askLlmAgent = async (connectorId) => {
    if (!onRunLlmAgent) {
      setAgentFeedback('LLM BIM agent is not available.');
      return;
    }
    const connector = getConnectorById(connectorId) ?? getConnectorById(DEFAULT_SINGLE_CONNECTOR_ID);
    const selectedResponder = `${connector?.label ?? connectorId}/${connector?.model ?? 'not configured'}`;
    const currentProviderStatus = friendlyProviderStatusMessage({
      connector,
      connectorStatus: agentProviderState.connectors?.find((entry) => entry.id === connector?.id),
      providerState: agentProviderState,
    });
    if (currentProviderStatus.status !== 'ready') {
      answerWithLocalFallback({
        selectedResponder,
        providerStatus: currentProviderStatus,
      });
      return;
    }
    setAgentResponse(buildBimAgentResponse({
      question: agentText,
      selectedResponder,
      actualResponder: selectedResponder,
      status: 'running',
      workSummary: `Asking ${connector?.label ?? connectorId}`,
      providerStatus: currentProviderStatus.status,
      providerStatusMessage: currentProviderStatus.message,
      didProviderRun: true,
    }));
    try {
      const draft = await onRunLlmAgent(agentText, connectorId);
      applyQueryDraft(draft.query, { run: false });
      setAgentFeedback(
        [
          draft.intentSummary,
          draft.ambiguityWarning,
          draft.connectorLabel && draft.model ? `Model: ${draft.connectorLabel}/${draft.model}` : null,
        ].filter(Boolean).join(' '),
      );
      const actualResponder = draft.connectorLabel && draft.model ? `${draft.connectorLabel}/${draft.model}` : selectedResponder;
      const fallbackUsed = draft.connectorLabel === 'Local BIM rules';
      const didProviderRun = draft.didProviderRun ?? !fallbackUsed;
      const providerStatusValue = draft.providerStatus ?? currentProviderStatus.status;
      const providerStatusMessage = draft.providerStatusMessage
        ?? (fallbackUsed ? 'Provider failed after the request started.' : currentProviderStatus.message);
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder,
        status: fallbackUsed ? 'fallback' : (draft.result?.status === 'error' ? 'error' : 'ready'),
        workSummary: draft.workSummary ?? (fallbackUsed
          ? (didProviderRun ? 'Provider failed; local rules answered' : 'Provider did not run; local rules answered')
          : 'Provider drafted BQL'),
        warnings: draft.warnings ?? draft.result?.warnings ?? [],
        query: draft.query,
        result: draft.result,
        providerStatus: providerStatusValue,
        providerStatusMessage,
        didProviderRun,
        fallbackUsed,
        semanticResolution: draft.semanticResolution,
      }));
    } catch (error) {
      setAgentFeedback(error?.message || 'LLM BIM agent failed.');
      setAgentResponse(buildBimAgentResponse({
        question: agentText,
        selectedResponder,
        actualResponder: selectedResponder,
        status: 'error',
        workSummary: 'Provider request failed',
        warnings: [error?.message || 'LLM BIM agent failed.'],
        providerStatus: currentProviderStatus.status,
        providerStatusMessage: error?.message || currentProviderStatus.message,
        didProviderRun: true,
      }));
    }
  };

  const askSelectedResponder = () => {
    if (responderId === LOCAL_BIM_RULES_RESPONDER_ID) {
      askAgent();
      return;
    }
    void askLlmAgent(responderId);
  };

  const statusLine = useMemo(
    () => agentFeedback || agentRunState.message || null,
    [agentFeedback, agentRunState.message],
  );

  return {
    agentText,
    setAgentText,
    setAgentFeedback,
    agentFeedback,
    agentResponse,
    responderId,
    setResponderId,
    providerStatus,
    selectedResponderLabel,
    responderLabel,
    askSelectedResponder,
    statusLine,
  };
}
