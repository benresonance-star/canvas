import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Copy, Play, Save, Trash2, X } from 'lucide-react';
import {
  deleteAgent,
  duplicateAgent,
  executeAgent,
  fetchAgent,
  fetchAgentExecutions,
  updateAgent,
} from '../api/agentsApi.js';
import {
  DEFAULT_IMAGE_AGENT_SETTINGS,
  generatedImageCardFromOutput,
  summarizeAgentStatus,
} from '../domain/agentArtifact.js';
import { fetchArtifactEdges } from '../../../lib/primitivesApi.js';
import { resolveAgentReferenceImages } from '../domain/referenceImages.js';

function artifactIdForCard(card) {
  const pinned = card?.versions?.find((v) => v.version === card.pinnedVersion) ?? card?.versions?.[0];
  return pinned?.artifactRef?.id ?? null;
}

function Section({ title, children, className = '' }) {
  return (
    <section className={`min-h-0 border border-border rounded bg-surface/80 p-3 ${className}`}>
      <h3 className="sans text-[10px] uppercase tracking-wider text-muted mb-2">{title}</h3>
      {children}
    </section>
  );
}

export function AgentControlRoom({
  card,
  cards = [],
  folderHandle = null,
  onClose,
  onDeleteCard,
  onUpdateCard,
  onAddOutputCards,
}) {
  const [agent, setAgent] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [promptArtifactId, setPromptArtifactId] = useState('');
  const [referenceArtifactIds, setReferenceArtifactIds] = useState([]);

  const agentId = card?.agentArtifactId || card?.versions?.[0]?.agentArtifactId || card?.versions?.[0]?.artifactRef?.id;

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    Promise.all([fetchAgent(agentId), fetchAgentExecutions(agentId), fetchArtifactEdges(agentId)])
      .then(([nextAgent, nextExecutions, edges]) => {
        if (cancelled) return;
        setAgent(nextAgent);
        setExecutions(nextExecutions);
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

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    setError('');
    try {
      const saved = await updateAgent(agent.id, agent);
      setAgent(saved);
      onUpdateCard?.({ name: saved.name });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
        const outputCards = outputs.map((output, index) =>
          generatedImageCardFromOutput(output, {
            x: baseX + (index % 2) * 300,
            y: baseY + Math.floor(index / 2) * 250,
          }),
        );
        await onAddOutputCards?.(outputCards);
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

  if (!agent) {
    return (
      <div className="fixed inset-0 z-[90] bg-canvas text-primary flex items-center justify-center">
        <p className="serif italic text-muted">{error || 'Loading agent...'}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-canvas text-primary overflow-auto">
      <div className="min-h-screen p-5 flex flex-col gap-4">
        <header className="shrink-0 flex items-center justify-between border-b border-border pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot size={18} />
              <h1 className="sans text-lg text-primary truncate">{agent.name}</h1>
            </div>
            <p className="sans text-[10px] uppercase tracking-wider text-muted mt-1">
              {agent.agentTypeName || 'Agent'} | {summarizeAgentStatus(executions)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={save} disabled={saving} title="Save" className="p-2 text-secondary hover:text-primary disabled:opacity-50">
              <Save size={16} />
            </button>
            <button type="button" onClick={duplicate} disabled={saving} title="Duplicate" className="p-2 text-secondary hover:text-primary disabled:opacity-50">
              <Copy size={16} />
            </button>
            <button type="button" onClick={archive} disabled={saving} title="Archive" className="p-2 text-secondary hover:text-danger disabled:opacity-50">
              <Trash2 size={16} />
            </button>
            <button type="button" onClick={onClose} title="Close" className="p-2 text-secondary hover:text-primary">
              <X size={18} />
            </button>
          </div>
        </header>

        {error && (
          <div className="sans text-xs text-danger bg-danger-muted border border-danger-border rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 flex-1 min-h-0">
          <Section title="Identity">
            <input value={agent.name} onChange={(e) => patchAgent({ name: e.target.value })} className="w-full bg-surface-muted border border-border rounded px-3 py-2 text-sm" />
            <textarea value={agent.description} onChange={(e) => patchAgent({ description: e.target.value })} rows={2} className="mt-2 w-full bg-surface-muted border border-border rounded px-3 py-2 text-xs resize-none" />
          </Section>

          <Section title="Connected Inputs">
            <select value={promptArtifactId} onChange={(e) => setPromptArtifactId(e.target.value)} className="w-full bg-surface-muted border border-border rounded px-2 py-2 text-xs">
              <option value="">Prompt note</option>
              {promptCards.map((entry) => (
                <option key={entry.id} value={artifactIdForCard(entry)}>{entry.name}</option>
              ))}
            </select>
            <div className="mt-2 max-h-24 overflow-auto space-y-1">
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
          </Section>

          <Section title="Goal">
            <textarea value={agent.goal} onChange={(e) => patchAgent({ goal: e.target.value })} rows={4} className="w-full h-full min-h-24 bg-surface-muted border border-border rounded px-3 py-2 text-sm resize-none" />
          </Section>

          <Section title="Instructions">
            <textarea value={agent.instructions} onChange={(e) => patchAgent({ instructions: e.target.value })} rows={6} className="w-full h-full min-h-32 bg-surface-muted border border-border rounded px-3 py-2 text-xs resize-none" />
          </Section>

          <Section title="Rules">
            <div className="space-y-2 max-h-36 overflow-auto">
              {(agent.rules ?? []).map((rule, index) => (
                <input
                  key={rule.id ?? index}
                  value={rule.body ?? rule.name ?? ''}
                  onChange={(e) => {
                    const next = [...(agent.rules ?? [])];
                    next[index] = { ...next[index], body: e.target.value };
                    patchAgent({ rules: next });
                  }}
                  className="w-full bg-surface-muted border border-border rounded px-2 py-1.5 text-xs"
                />
              ))}
            </div>
          </Section>

          <Section title="Skills">
            <div className="flex flex-wrap gap-2">
              {(agent.skills ?? []).map((skill, index) => (
                <span key={skill.id ?? index} className="sans text-[10px] border border-border rounded px-2 py-1 text-secondary">
                  {skill.name ?? skill.id}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Tools">
            <div className="flex flex-wrap gap-2">
              {(agent.tools ?? []).map((tool, index) => (
                <span key={tool.id ?? index} className="sans text-[10px] border border-border rounded px-2 py-1 text-secondary">
                  {tool.name ?? tool.id}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Memory Sources">
            <p className="sans text-xs text-muted">{agent.memorySources?.length || 0} saved sources</p>
          </Section>

          <Section title="Model Preferences">
            <div className="grid grid-cols-2 gap-2">
              <select value={settings.provider} onChange={(e) => patchSettings({ provider: e.target.value })} className="bg-surface-muted border border-border rounded px-2 py-2 text-xs">
                <option value="local">Local placeholder</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="comfyui">ComfyUI</option>
              </select>
              <input value={settings.model ?? ''} onChange={(e) => patchSettings({ model: e.target.value })} placeholder="model" className="bg-surface-muted border border-border rounded px-2 py-2 text-xs" />
            </div>
          </Section>

          <Section title="Transformer Settings">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={settings.aspectRatio} onChange={(e) => patchSettings({ aspectRatio: e.target.value })} className="bg-surface-muted border border-border rounded px-2 py-2 text-xs">
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
              <select value={settings.quality} onChange={(e) => patchSettings({ quality: e.target.value })} className="bg-surface-muted border border-border rounded px-2 py-2 text-xs">
                <option value="draft">Draft</option>
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
              <input type="number" min="1" max="8" value={settings.imageCount} onChange={(e) => patchSettings({ imageCount: Number(e.target.value) })} className="bg-surface-muted border border-border rounded px-2 py-2 text-xs" />
              <select value={settings.outputFormat} onChange={(e) => patchSettings({ outputFormat: e.target.value })} className="bg-surface-muted border border-border rounded px-2 py-2 text-xs">
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="webp">WEBP</option>
              </select>
            </div>
          </Section>

          <Section title="Recent Executions">
            <div className="space-y-1 max-h-36 overflow-auto">
              {executions.map((execution) => (
                <div key={execution.id} className="flex justify-between gap-2 text-xs border-b border-border/60 py-1">
                  <span>#{String(execution.executionNumber).padStart(4, '0')}</span>
                  <span className="text-muted">{execution.status}</span>
                </div>
              ))}
              {!executions.length && <p className="text-xs text-muted">No executions yet.</p>}
            </div>
          </Section>

          <Section title="Outputs" className="xl:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="sans text-xs text-muted">
                {(executions[0]?.outputs?.artifacts ?? []).length} output artifact(s) on latest run
              </p>
              <button
                type="button"
                onClick={run}
                disabled={running || !promptArtifactId}
                className="sans inline-flex items-center gap-2 bg-accent text-on-accent px-4 py-2 rounded text-xs disabled:opacity-50"
              >
                <Play size={14} />
                {running ? 'Running...' : 'Run Agent'}
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
