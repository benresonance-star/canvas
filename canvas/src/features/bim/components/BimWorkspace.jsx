import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createIndexedDbBimRepository } from '../bim-core/bimRepository.js';
import { executeBqlQuery } from '../bim-core/bql.js';
import { prepareBimModel } from '../bim-core/prepareBimModel.js';
import { normalizeBimWorkspaceState } from '../bim-core/types.js';
import { useBimModelSource } from '../hooks/useBimModelSource.js';
import { BimElementTable } from './BimElementTable.jsx';
import { BimInspector } from './BimInspector.jsx';
import { BimQueryPanel } from './BimQueryPanel.jsx';
import { BimViewport } from './BimViewport.jsx';

const PHASE_LABELS = {
  preparing: 'Preparing model',
  converting_ifc: 'Converting IFC',
  extracting_properties: 'Extracting properties and relationships',
  building_index: 'Building BIM index',
  ready: 'Ready',
};

function BimExtractionFeed({ events }) {
  const visibleEvents = events.slice(-8);
  if (visibleEvents.length === 0) return null;
  return (
    <div className="mt-4 w-[min(36rem,90vw)] rounded border border-border bg-surface/95 text-left shadow-sm">
      <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted">
        Live extraction feed
      </div>
      <div className="max-h-44 overflow-auto px-3 py-2 space-y-1">
        {visibleEvents.map((event) => (
          <div key={event.id} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted">{event.kind}</span>
            <span className="text-secondary">
              {event.message}
              {Number.isFinite(event.current) && Number.isFinite(event.total) ? ` (${event.current}/${event.total})` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BimWorkspace({
  card,
  version,
  folderHandle = null,
}) {
  const source = useBimModelSource(version, { folderHandle });
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) repositoryRef.current = createIndexedDbBimRepository();
  const [phase, setPhase] = useState('preparing');
  const [cacheStatus, setCacheStatus] = useState('preparing');
  const [error, setError] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [fingerprint, setFingerprint] = useState(null);
  const [workspaceState, setWorkspaceState] = useState(() => normalizeBimWorkspaceState(version?.bim?.workspaceState));
  const [selectionFocusToken, setSelectionFocusToken] = useState(0);
  const [extractionFeed, setExtractionFeed] = useState([]);
  const [queryResult, setQueryResult] = useState(null);
  const [prepRunId, setPrepRunId] = useState(0);

  const appendExtractionEvent = (event) => {
    setExtractionFeed((feed) => [
      ...feed.slice(-59),
      {
        id: `${Date.now()}:${feed.length}`,
        kind: event.kind ?? 'info',
        message: event.message ?? String(event),
        current: event.current ?? null,
        total: event.total ?? null,
      },
    ]);
  };

  useEffect(() => {
    if (!source.arrayBuffer || !version?.content_hash) return undefined;
    let cancelled = false;
    async function run() {
      setError(null);
      setExtractionFeed([]);
      try {
        const result = await prepareBimModel({
          arrayBuffer: source.arrayBuffer,
          version,
          repository: repositoryRef.current,
          onPhase: (nextPhase) => {
            if (!cancelled) setPhase(nextPhase);
          },
          onProgress: (event) => {
            if (!cancelled) appendExtractionEvent(event);
          },
        });
        if (cancelled) return;
        const savedState = await repositoryRef.current.getWorkspaceState(result.fingerprint);
        if (cancelled) return;
        setPrepared(result.preparedModel);
        setCacheStatus(result.reused ? 'loaded_cache' : 'prepared');
        setWorkspaceState((current) => normalizeBimWorkspaceState({
          ...current,
          ...(savedState ?? {}),
          lastOpenedAt: new Date().toISOString(),
        }));
        setFingerprint(result.fingerprint);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not prepare BIM model');
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [prepRunId, source.arrayBuffer, version]);

  useEffect(() => {
    if (!fingerprint) return;
    void repositoryRef.current.putWorkspaceState(fingerprint, workspaceState);
  }, [fingerprint, workspaceState]);

  const selectedElement = useMemo(
    () => prepared?.elements?.find((element) => element.id === workspaceState.selectedObjectId) ?? null,
    [prepared?.elements, workspaceState.selectedObjectId],
  );
  const selectedProperties = useMemo(
    () => prepared?.properties?.filter((property) => property.elementId === selectedElement?.id) ?? [],
    [prepared?.properties, selectedElement?.id],
  );
  const selectedProvenance = useMemo(
    () => prepared?.provenance?.filter((record) => record.recordId === selectedElement?.id) ?? [],
    [prepared?.provenance, selectedElement?.id],
  );
  const queryElementIds = useMemo(
    () => queryResult?.objectRefs
      ?.filter((ref) => ref.kind === 'physicalElement')
      .map((ref) => ref.id) ?? [],
    [queryResult],
  );
  const tableElements = useMemo(() => {
    if (!prepared) return [];
    if (!queryResult || queryResult.select === 'count') return prepared.elements;
    const ids = new Set(queryElementIds);
    return prepared.elements.filter((element) => ids.has(element.id));
  }, [prepared, queryElementIds, queryResult]);

  const patchWorkspaceState = (patch) => {
    setWorkspaceState((state) => normalizeBimWorkspaceState({ ...state, ...patch }));
  };

  const selectElementByGlobalId = (ifcGlobalId) => {
    const element = prepared?.elements?.find((candidate) => candidate.ifcGlobalId === ifcGlobalId);
    if (!element) return;
    setQueryResult(null);
    patchWorkspaceState({
      selectedObjectId: element.id,
      selectedObjectKind: 'physicalElement',
      tableSearch: '',
      ifcClassFilter: '',
    });
  };

  const runBqlQuery = (query) => {
    if (!prepared) return;
    const result = executeBqlQuery(prepared, query);
    result.select = query.select;
    setQueryResult(result);
    if (result.viewerState?.mode && result.viewerState.mode !== 'colorBy') {
      patchWorkspaceState({ displayMode: result.viewerState.mode });
    }
    const firstPhysicalRef = result.objectRefs.find((ref) => ref.kind === 'physicalElement');
    if (firstPhysicalRef) {
      patchWorkspaceState({
        selectedObjectId: firstPhysicalRef.id,
        selectedObjectKind: 'physicalElement',
      });
      if (result.viewerState?.focus) setSelectionFocusToken((token) => token + 1);
    }
  };

  const clearBqlQuery = () => {
    setQueryResult(null);
  };

  const rebuildBimCache = async () => {
    if (!fingerprint) return;
    await repositoryRef.current.deletePreparedModel?.(fingerprint);
    setPrepared(null);
    setFingerprint(null);
    setQueryResult(null);
    setCacheStatus('preparing');
    setPhase('preparing');
    setPrepRunId((runId) => runId + 1);
  };

  const leftPanelOpen = workspaceState.panels?.left !== false;
  const rightPanelOpen = workspaceState.panels?.right !== false;
  const togglePanel = (panel) => {
    patchWorkspaceState({
      panels: {
        ...(workspaceState.panels ?? { left: true, right: true }),
        [panel]: !workspaceState.panels?.[panel],
      },
    });
  };

  if (source.loading || (!prepared && !error)) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-preview-bg text-center px-8">
        <div>
          <div className="serif text-lg text-primary mb-2">{PHASE_LABELS[phase] ?? 'Preparing model'}</div>
          <div className="sans text-xs text-muted">{version?.filename ?? card?.name}</div>
          <BimExtractionFeed events={extractionFeed} />
        </div>
      </div>
    );
  }

  if (source.error || error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-preview-bg text-center px-8">
        <div>
          <div className="serif text-lg text-primary mb-2">Could not prepare BIM model</div>
          <div className="sans text-xs text-warning">{source.error || error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">BIM Workspace</div>
          <div className="serif text-sm text-primary">{card?.name ?? version?.filename}</div>
        </div>
        <div className="text-[10px] text-muted">
          {prepared.elements.length} elements · {prepared.properties.length} properties
        </div>
      </div>
      <div className="shrink-0 border-b border-border bg-preview-bg px-3 py-1 text-[10px] uppercase tracking-wider text-muted">
        {cacheStatus === 'loaded_cache' ? 'Loaded prepared BIM cache' : 'Prepared BIM cache'} - {PHASE_LABELS[phase] ?? 'Ready'}
        {prepared.metadata?.fragmentsStatus === 'failed' ? ' - Fragments conversion failed; evidence view remains available' : ''}
      </div>
      {extractionFeed.length > 0 && cacheStatus !== 'loaded_cache' && (
        <div className="shrink-0 border-b border-border bg-surface px-3 py-1 text-[10px] text-muted">
          {extractionFeed.at(-1)?.message}
        </div>
      )}
      <BimQueryPanel
        queryResult={queryResult}
        onRunQuery={runBqlQuery}
        onClearQuery={clearBqlQuery}
        onRebuildCache={rebuildBimCache}
        rebuildDisabled={!fingerprint}
      />
      {prepared.warnings?.length > 0 && (
        <div className="shrink-0 border-b border-border bg-warning/10 px-3 py-1 text-[10px] text-warning">
          {prepared.warnings.join(' ')}
        </div>
      )}
      <div
        className="flex-1 min-h-0 grid"
        style={{
          gridTemplateColumns: `${leftPanelOpen ? 'minmax(18rem,25%)' : '0'} minmax(0,1fr) ${rightPanelOpen ? 'minmax(18rem,25%)' : '0'}`,
        }}
      >
        <div className="h-full min-h-0 overflow-hidden" style={{ gridColumn: 1 }}>
          {leftPanelOpen ? (
            <BimElementTable
              elements={tableElements}
              selectedElementId={workspaceState.selectedObjectId}
              search={workspaceState.tableSearch}
              ifcClassFilter={workspaceState.ifcClassFilter}
              title={queryResult ? 'BQL result' : 'Elements'}
              onSearchChange={(tableSearch) => patchWorkspaceState({ tableSearch })}
              onIfcClassFilterChange={(ifcClassFilter) => patchWorkspaceState({ ifcClassFilter })}
              onSelectElement={(selectedObjectId) => {
                setSelectionFocusToken((token) => token + 1);
                patchWorkspaceState({ selectedObjectId, selectedObjectKind: 'physicalElement' });
              }}
            />
          ) : null}
        </div>
        <div className="h-full min-h-0" style={{ gridColumn: 2 }}>
          <BimViewport
            preparedModel={prepared}
            selectedElement={selectedElement}
            selectedProperties={selectedProperties}
            highlightElementIds={queryElementIds}
            displayMode={workspaceState.displayMode}
            focusSelectionToken={selectionFocusToken}
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            onToggleLeftPanel={() => togglePanel('left')}
            onToggleRightPanel={() => togglePanel('right')}
            onDisplayModeChange={(displayMode) => patchWorkspaceState({ displayMode })}
            onSelectElementByGlobalId={selectElementByGlobalId}
            onCameraChange={(camera) => patchWorkspaceState({ camera })}
          />
        </div>
        <div className="h-full min-h-0 overflow-hidden" style={{ gridColumn: 3 }}>
          {rightPanelOpen ? (
            <BimInspector
              element={selectedElement}
              properties={selectedProperties}
              provenance={selectedProvenance}
              assemblies={prepared.semanticAssemblies ?? []}
              assemblyMembers={prepared.assemblyMembers ?? []}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
