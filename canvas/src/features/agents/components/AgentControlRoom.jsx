import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  Image,
  Play,
  Settings2,
  Sparkles,
  Star,
  Target,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { strings } from '../../../content/strings.js';
import {
  deleteAgent,
  duplicateAgent,
  executeAgent,
  fetchAgent,
  fetchAgentExecutions,
  fetchAgentModelOptions,
  updateAgent,
} from '../api/agentsApi.js';
import {
  DEFAULT_IMAGE_AGENT_SETTINGS,
} from '../domain/agentArtifact.js';
import { defaultModelForProvider, FALLBACK_IMAGE_MODEL_OPTIONS } from '../domain/imageModelOptions.js';
import { completeAgentImageGeneration } from '../domain/completeAgentImageGeneration.js';
import { fetchArtifactEdges } from '../../../lib/primitivesApi.js';
import { resolveAgentReferenceImages } from '../domain/referenceImages.js';
import {
  AgentControlRoomField,
  AgentControlRoomSection,
} from './AgentControlRoomSection.jsx';

const copy = strings.agent.controlRoom;
const inputClass = 'w-full bg-surface-muted border border-border rounded px-2 py-2 text-xs text-primary';
const textareaClass = 'w-full bg-surface-muted border border-border rounded px-3 py-2 text-xs text-primary resize-none';

function artifactIdForCard(card) {
  const pinned = card?.versions?.find((v) => v.version === card.pinnedVersion) ?? card?.versions?.[0];
  return pinned?.artifactRef?.id ?? null;
}

function formatExecutionWhen(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function executionStatusLabel(status) {
  if (status === 'completed') return copy.statusCompleted;
  if (status === 'failed') return copy.statusFailed;
  if (status === 'running') return copy.statusRunning;
  return status;
}

export function AgentControlRoom({
  card,
  cards = [],
  folderHandle = null,
  folderPresentKeys = null,
  setFolderPresentKeys = null,
  clusterId = null,
  projectId = null,
  projectName = null,
  refreshGraph = null,
  onClose,
  onDeleteCard,
  onUpdateCard,
  onAddOutputCards,
  onOpenLatestOutput,
}) {
  const [agent, setAgent] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [promptArtifactId, setPromptArtifactId] = useState('');
  const [referenceArtifactIds, setReferenceArtifactIds] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllExecutions, setShowAllExecutions] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [modelOptions, setModelOptions] = useState([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const menuRef = useRef(null);

  const agentId = card?.agentArtifactId || card?.versions?.[0]?.agentArtifactId || card?.versions?.[0]?.artifactRef?.id;

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    Promise.all([fetchAgent(agentId), fetchAgentExecutions(agentId), fetchArtifactEdges(agentId)])
      .then(([nextAgent, nextExecutions, edges]) => {
        if (cancelled) return;
        setAgent(nextAgent);
        setExecutions(nextExecutions);
        setNameDraft(nextAgent.name ?? '');
        setDescriptionDraft(nextAgent.description ?? '');
        const incoming = edges?.incoming ?? [];
        const promptRel = incoming.find((edge) => edge.type === 'prompt_input_to');
        const referenceRels = incoming.filter((edge) => edge.type === 'reference_input_to');
        if (promptRel?.from_id) {
          setPromptArtifactId(promptRel.from_id);
        }
        if (referenceRels.length) {
          setReferenceArtifactIds([...new Set(referenceRels.map((edge) => edge.from_id).filter(Boolean))]);
        }
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const promptCards = useMemo(() =>
    cards.filter((entry) => ['user_note', 'markdown', 'note'].includes(entry.type) && artifactIdForCard(entry)),
  [cards]);

  const referenceCards = useMemo(() =>
    cards.filter((entry) =>
      ['image', 'file', 'pdf', 'markdown', 'code'].includes(entry.type)
      && artifactIdForCard(entry)
      && artifactIdForCard(entry) !== promptArtifactId,
    ),
  [cards, promptArtifactId]);

  const settings = {
    ...DEFAULT_IMAGE_AGENT_SETTINGS,
    ...(agent?.transformerSettings ?? {}),
  };

  useEffect(() => {
    if (!agent) return undefined;
    let cancelled = false;
    setModelOptionsLoading(true);
    void fetchAgentModelOptions(settings.provider)
      .then((result) => {
        if (cancelled) return;
        const models = result?.models ?? [];
        setModelOptions(models);
        const currentModel = settings.model;
        const hasCurrent = models.some((entry) => entry.model === currentModel);
        if ((!currentModel || !hasCurrent) && models.length) {
          patchSettings({ model: models[0].model });
        }
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = FALLBACK_IMAGE_MODEL_OPTIONS[settings.provider]
            || FALLBACK_IMAGE_MODEL_OPTIONS.local;
          setModelOptions([...fallback]);
        }
      })
      .finally(() => {
        if (!cancelled) setModelOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent?.id, settings.provider]);

  const latestExecution = executions[0] ?? null;
  const latestOutputs = latestExecution?.outputs?.artifacts ?? [];
  const latestOutputArtifactId = latestOutputs[0]?.id ?? null;
  const visibleExecutions = showAllExecutions ? executions : executions.slice(0, 5);

  const patchAgent = (patch) => {
    setAgent((prev) => ({ ...prev, ...patch }));
  };

  const patchSettings = (patch) => {
    setAgent((prev) => ({
      ...prev,
      transformerSettings: {
        ...DEFAULT_IMAGE_AGENT_SETTINGS,
        ...(prev?.transformerSettings ?? {}),
        ...patch,
      },
    }));
  };

  const save = async (patch = {}) => {
    if (!agent) return;
    setSaving(true);
    setError('');
    try {
      const payload = { ...agent, ...patch };
      const saved = await updateAgent(agent.id, payload);
      setAgent(saved);
      setNameDraft(saved.name ?? '');
      setDescriptionDraft(saved.description ?? '');
      onUpdateCard?.({ name: saved.name });
      setMenuOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === agent?.name) return;
    await save({ name: trimmed });
  };

  const run = async () => {
    if (!agent || !promptArtifactId) return;
    setRunning(true);
    setError('');
    try {
      const referenceImages = await resolveAgentReferenceImages({
        cards,
        referenceArtifactIds,
        folderHandle,
      });
      const result = await executeAgent(agent.id, {
        promptNoteArtifactId: promptArtifactId,
        referenceArtifactIds,
        referenceImages,
        settings,
      });
      const execution = result.execution;
      setExecutions(await fetchAgentExecutions(agent.id));
      const outputs = execution.outputs?.artifacts ?? [];
      if (outputs.length) {
        const baseX = (card?.x ?? 100) + (card?.w ?? 240) + 60;
        const baseY = card?.y ?? 100;
        const positions = outputs.map((output, index) => ({
          x: baseX + (index % 2) * 300,
          y: baseY + Math.floor(index / 2) * 250,
        }));
        const { folderWriteOk } = await completeAgentImageGeneration({
          folderHandle,
          folderPresentKeys,
          setFolderPresentKeys,
          outputs,
          positions,
          executionId: execution.id,
          agentArtifactRef: { id: agent.id, type: 'artifact' },
          clusterId,
          projectId,
          projectName,
          appendGeneratedCards: onAddOutputCards,
          refreshGraph,
        });
        if (folderHandle && !folderWriteOk) {
          setError('Images were generated but could not be saved to the linked folder.');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const duplicate = async () => {
    if (!agent) return;
    setSaving(true);
    setError('');
    try {
      await duplicateAgent(agent.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!agent) return;
    setSaving(true);
    setError('');
    try {
      await deleteAgent(agent.id);
      await onDeleteCard?.(card.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openLatestOutput = () => {
    if (!latestOutputArtifactId) return;
    onOpenLatestOutput?.({ artifactId: latestOutputArtifactId });
  };

  if (!agent) {
    return (
      <div className="fixed inset-0 z-[90] bg-canvas text-primary flex items-center justify-center">
        <p className="serif italic text-muted">{error || copy.loading}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-canvas text-primary overflow-auto">
      <div className="min-h-screen p-5 flex flex-col gap-4 max-w-[1600px] mx-auto">
        <header className="shrink-0 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0 flex items-start gap-3">
            <span className="shrink-0 w-10 h-10 rounded-lg border border-agent-artifact-icon-border bg-agent-artifact-icon-bg flex items-center justify-center text-agent-artifact-muted">
              <Sparkles size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => { void saveName(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="sans text-lg font-medium text-primary bg-transparent border-0 outline-none min-w-0 flex-1"
                  aria-label="Agent name"
                />
                <span className="sans text-[10px] rounded-full px-2 py-0.5 bg-agent-artifact-icon-bg border border-agent-artifact-icon-border text-agent-artifact-muted">
                  {latestExecution
                    ? copy.executionBadge(latestExecution.executionNumber)
                    : copy.neverRun}
                </span>
              </div>
              <p className="sans text-[10px] uppercase tracking-wider text-muted mt-1">
                {agent.agentTypeName || 'Agent'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title={copy.helpTitle}
              aria-label={copy.helpTitle}
              className="p-2 text-secondary hover:text-primary rounded"
            >
              <HelpCircle size={16} />
            </button>
            <button
              type="button"
              onClick={() => { void duplicate(); }}
              disabled={saving}
              title={copy.duplicate}
              aria-label={copy.duplicate}
              className="p-2 text-secondary hover:text-primary disabled:opacity-50 rounded"
            >
              <Copy size={16} />
            </button>
            <button
              type="button"
              onClick={() => { void archive(); }}
              disabled={saving}
              title={copy.archive}
              aria-label={copy.archive}
              className="p-2 text-secondary hover:text-danger disabled:opacity-50 rounded"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => { void save(); }}
              disabled={saving}
              className="sans inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface-muted text-xs font-medium text-primary hover:border-accent disabled:opacity-50"
            >
              <Check size={14} aria-hidden />
              {saving ? copy.saving : copy.save}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                title={copy.descriptionMenu}
                aria-label={copy.descriptionMenu}
                aria-expanded={menuOpen}
                className="sans inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-surface text-xs text-secondary hover:text-primary hover:border-accent"
              >
                <FileText size={14} aria-hidden />
                {copy.descriptionMenu}
                <ChevronRight
                  size={14}
                  aria-hidden
                  className={`transition-transform ${menuOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-surface shadow-card p-3 z-10">
                  <div className="space-y-3">
                    <div>
                      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-1">
                        {copy.editDescription}
                      </div>
                      <textarea
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        rows={4}
                        placeholder={copy.descriptionPlaceholder}
                        className={textareaClass}
                      />
                      <button
                        type="button"
                        onClick={() => { void save({ description: descriptionDraft }); }}
                        disabled={saving}
                        className="sans mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover disabled:opacity-50"
                      >
                        <Check size={12} aria-hidden />
                        {saving ? copy.saving : copy.saveDescription}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              title={copy.close}
              aria-label={copy.close}
              className="p-2 text-secondary hover:text-primary rounded"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {error && (
          <div className="sans text-xs text-danger bg-danger-muted border border-danger-border rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="agent-control-room-grid flex-1 min-h-0">
          <div className="agent-control-room-column">
            <AgentControlRoomSection icon={Globe} title={copy.sections.modelPreferences}>
              <div className="space-y-2">
                <AgentControlRoomField label={copy.fields.provider}>
                  <select
                    value={settings.provider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      patchSettings({
                        provider,
                        model: defaultModelForProvider(provider),
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="local">{copy.providers.local}</option>
                    <option value="openai">{copy.providers.openai}</option>
                    <option value="gemini">{copy.providers.gemini}</option>
                    <option value="comfyui">{copy.providers.comfyui}</option>
                  </select>
                </AgentControlRoomField>
                <AgentControlRoomField label={copy.fields.model}>
                  <select
                    value={settings.model ?? ''}
                    onChange={(e) => patchSettings({ model: e.target.value })}
                    disabled={modelOptionsLoading || modelOptions.length === 0}
                    className={inputClass}
                  >
                    {modelOptionsLoading && (
                      <option value="">{copy.modelsLoading}</option>
                    )}
                    {!modelOptionsLoading && modelOptions.length === 0 && (
                      <option value="">{copy.noModels}</option>
                    )}
                    {modelOptions.map((entry) => (
                      <option key={entry.model} value={entry.model}>
                        {entry.label}
                      </option>
                    ))}
                    {!modelOptionsLoading
                      && settings.model
                      && !modelOptions.some((entry) => entry.model === settings.model) && (
                      <option value={settings.model}>{settings.model}</option>
                    )}
                  </select>
                </AgentControlRoomField>
              </div>
            </AgentControlRoomSection>

            <AgentControlRoomSection icon={Settings2} title={copy.sections.transformerSettings}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <AgentControlRoomField label={copy.fields.aspectRatio}>
                  <select
                    value={settings.aspectRatio}
                    onChange={(e) => patchSettings({ aspectRatio: e.target.value })}
                    className={inputClass}
                  >
                    <option value="1:1">1:1</option>
                    <option value="4:3">4:3</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </AgentControlRoomField>
                <AgentControlRoomField label={copy.fields.quality}>
                  <select
                    value={settings.quality}
                    onChange={(e) => patchSettings({ quality: e.target.value })}
                    className={inputClass}
                  >
                    <option value="draft">Draft</option>
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                  </select>
                </AgentControlRoomField>
                <AgentControlRoomField label={copy.fields.imageCount}>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={settings.imageCount}
                    onChange={(e) => patchSettings({ imageCount: Number(e.target.value) })}
                    className={inputClass}
                  />
                </AgentControlRoomField>
                <AgentControlRoomField label={copy.fields.fileFormat}>
                  <select
                    value={settings.outputFormat}
                    onChange={(e) => patchSettings({ outputFormat: e.target.value })}
                    className={inputClass}
                  >
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                    <option value="webp">WEBP</option>
                  </select>
                </AgentControlRoomField>
              </div>
            </AgentControlRoomSection>

            <AgentControlRoomSection
              icon={Database}
              title={copy.sections.memorySources}
              footer={copy.connectedInputsHint}
            >
              <p className="sans text-xs text-muted">{copy.memoryCount(agent.memorySources?.length || 0)}</p>
              {(agent.memorySources ?? []).length > 0 && (
                <ul className="mt-2 space-y-1 max-h-24 overflow-auto">
                  {(agent.memorySources ?? []).map((source, index) => (
                    <li key={source.id ?? index} className="sans text-xs text-secondary truncate">
                      {source.name ?? source.id}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 pt-3 border-t border-border-subtle space-y-2">
                <p className="sans text-[10px] uppercase tracking-wider text-muted">
                  {copy.sections.connectedInputs}
                </p>
                <AgentControlRoomField label={copy.fields.promptSource}>
                  <select
                    value={promptArtifactId}
                    onChange={(e) => setPromptArtifactId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{copy.promptPlaceholder}</option>
                    {promptCards.map((entry) => (
                      <option key={entry.id} value={artifactIdForCard(entry)}>{entry.name}</option>
                    ))}
                  </select>
                </AgentControlRoomField>
                <div className="max-h-32 overflow-auto space-y-1">
                  {referenceCards.map((entry) => {
                    const id = artifactIdForCard(entry);
                    const checked = referenceArtifactIds.includes(id);
                    return (
                      <label key={entry.id} className="flex items-center gap-2 text-xs text-secondary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setReferenceArtifactIds((prev) =>
                            checked ? prev.filter((item) => item !== id) : [...prev, id],
                          )}
                        />
                        <span className="truncate">{entry.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </AgentControlRoomSection>

            <div className="agent-control-room-run-footer">
              <button
                type="button"
                onClick={() => { void run(); }}
                disabled={running || !promptArtifactId}
                className="sans w-full inline-flex items-center justify-center gap-2 bg-accent text-on-accent px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                <Play size={16} />
                {running ? copy.running : copy.runAgent}
              </button>
              <p className="sans text-[10px] text-muted mt-2 text-center leading-snug">
                {copy.runCaption}
              </p>
            </div>
          </div>

          <div className="agent-control-room-column">
            <AgentControlRoomSection icon={Target} title={copy.sections.goal}>
              <textarea
                value={agent.goal}
                onChange={(e) => patchAgent({ goal: e.target.value })}
                rows={3}
                className={`${textareaClass} min-h-20`}
              />
            </AgentControlRoomSection>

            <AgentControlRoomSection icon={FileText} title={copy.sections.instructions}>
              <textarea
                value={agent.instructions}
                onChange={(e) => patchAgent({ instructions: e.target.value })}
                rows={6}
                className={`${textareaClass} min-h-32`}
              />
            </AgentControlRoomSection>

            <AgentControlRoomSection icon={Star} title={copy.sections.skills}>
              <div className="flex flex-wrap gap-2">
                {(agent.skills ?? []).map((skill, index) => (
                  <span
                    key={skill.id ?? index}
                    className="sans text-[10px] border border-agent-artifact-icon-border bg-agent-artifact-icon-bg rounded-full px-2.5 py-1 text-agent-artifact-muted"
                  >
                    {skill.name ?? skill.id}
                  </span>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <p className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
                  {copy.sections.rules}
                </p>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {(agent.rules ?? []).map((rule, index) => (
                      <div key={rule.id ?? index} className="flex items-start gap-2">
                        <Check size={14} className="shrink-0 mt-1 text-accent" aria-hidden />
                        <input
                          value={rule.body ?? rule.name ?? ''}
                          onChange={(e) => {
                            const next = [...(agent.rules ?? [])];
                            next[index] = { ...next[index], body: e.target.value };
                            patchAgent({ rules: next });
                          }}
                          className={`${inputClass} flex-1`}
                        />
                      </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <p className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
                  {copy.sections.tools}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(agent.tools ?? []).map((tool, index) => (
                      <span
                        key={tool.id ?? index}
                        className="sans text-[10px] border border-border bg-surface-muted rounded-full px-2.5 py-1 text-secondary"
                      >
                        {tool.name ?? tool.id}
                      </span>
                  ))}
                </div>
              </div>
            </AgentControlRoomSection>
          </div>

          <div className="agent-control-room-column">
            <AgentControlRoomSection icon={Clock3} title={copy.sections.recentExecutions}>
              <div className="space-y-1">
                {visibleExecutions.map((execution) => {
                  const completed = execution.status === 'completed';
                  const failed = execution.status === 'failed';
                  return (
                    <div
                      key={execution.id}
                      className="flex items-center gap-2 text-xs border-b border-border-markdown-faint py-1.5 last:border-0"
                    >
                      <span
                        className={`shrink-0 w-2 h-2 rounded-full ${
                          completed ? 'bg-success' : failed ? 'bg-danger' : 'bg-muted'
                        }`}
                        aria-hidden
                      />
                      <span className="shrink-0 font-medium text-primary">
                        {copy.executionBadge(execution.executionNumber)}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-muted">
                        {formatExecutionWhen(execution.completedAt || execution.startedAt)}
                      </span>
                      <span className="shrink-0 text-muted hidden sm:inline">
                        {executionStatusLabel(execution.status)}
                      </span>
                      {completed && <CheckCircle2 size={14} className="shrink-0 text-success" aria-hidden />}
                      {failed && <XCircle size={14} className="shrink-0 text-danger" aria-hidden />}
                    </div>
                  );
                })}
                {!executions.length && (
                  <p className="text-xs text-muted">{copy.noExecutions}</p>
                )}
              </div>
              {executions.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllExecutions((value) => !value)}
                  className="sans mt-2 inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
                >
                  {showAllExecutions ? copy.showFewerExecutions : copy.viewAllExecutions}
                  <ChevronRight size={12} className={showAllExecutions ? 'rotate-90' : ''} />
                </button>
              )}
            </AgentControlRoomSection>

            <AgentControlRoomSection icon={Image} title={copy.sections.outputs}>
              <div className="rounded-lg border border-border-subtle bg-surface-muted/60 px-4 py-6 text-center">
                <div className="mx-auto mb-3 w-10 h-10 rounded-md border border-border bg-surface flex items-center justify-center text-muted">
                  <Image size={18} strokeWidth={1.5} aria-hidden />
                </div>
                <p className="sans text-xs text-primary">{copy.outputsCount(latestOutputs.length)}</p>
                {latestExecution && (
                  <p className="sans text-[10px] text-muted mt-1">
                    {copy.outputsProvenance(
                      copy.executionBadge(latestExecution.executionNumber),
                      formatExecutionWhen(latestExecution.completedAt || latestExecution.startedAt),
                    )}
                  </p>
                )}
                <button
                  type="button"
                  onClick={openLatestOutput}
                  disabled={!latestOutputArtifactId || latestExecution?.status !== 'completed'}
                  className="sans mt-4 inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-xs text-secondary hover:text-primary hover:border-accent/40 disabled:opacity-50"
                >
                  <ExternalLink size={12} />
                  {copy.viewLatestOutput}
                </button>
              </div>
            </AgentControlRoomSection>
          </div>
        </div>
      </div>
    </div>
  );
}
