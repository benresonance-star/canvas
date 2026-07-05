import { useCallback, useEffect, useMemo, useState } from 'react';
import { prettyQuery } from '../components/bimAgentPanelShared.js';
import { BQL_PRESET_QUERIES } from '../components/bimBqlPanelShared.js';

export function useBimBqlPanel({
  queryResult,
  onRunQuery,
  onClearQuery,
  onRebuildCache,
  savedQueries = [],
  onSaveQuery = () => {},
  onDeleteSavedQuery = () => {},
  rebuildDisabled = false,
  onRegisterQueryDraftHandler = () => {},
  onAgentFeedback = () => {},
}) {
  const [queryText, setQueryText] = useState(() => prettyQuery(BQL_PRESET_QUERIES.allBeams.query));
  const [parseError, setParseError] = useState(null);
  const [selectedSavedQueryId, setSelectedSavedQueryId] = useState('');
  const summary = useMemo(() => queryResult?.summary ?? 'Raw element mode', [queryResult]);

  useEffect(() => {
    onRegisterQueryDraftHandler((nextQueryText, { query, run = true } = {}) => {
      setQueryText(nextQueryText);
      if (run && query) onRunQuery(query);
    });
  }, [onRegisterQueryDraftHandler, onRunQuery]);

  const run = useCallback(() => {
    try {
      const query = JSON.parse(queryText);
      setParseError(null);
      onRunQuery(query);
    } catch (error) {
      setParseError(error?.message || 'Invalid JSON');
    }
  }, [onRunQuery, queryText]);

  const parseCurrentQuery = useCallback(() => {
    try {
      const query = JSON.parse(queryText);
      setParseError(null);
      return query;
    } catch (error) {
      setParseError(error?.message || 'Invalid JSON');
      return null;
    }
  }, [queryText]);

  const saveQuery = useCallback(() => {
    const query = parseCurrentQuery();
    if (!query) return;
    onSaveQuery(queryResult?.summary || 'Saved BIM query', query);
  }, [onSaveQuery, parseCurrentQuery, queryResult?.summary]);

  const applyPreset = useCallback((presetKey) => {
    const preset = BQL_PRESET_QUERIES[presetKey];
    if (preset) setQueryText(prettyQuery(preset.query));
  }, []);

  const loadSavedQuery = useCallback((savedQueryId) => {
    setSelectedSavedQueryId(savedQueryId);
    const saved = savedQueries.find((entry) => entry.id === savedQueryId);
    if (!saved) return;
    setQueryText(prettyQuery(saved.query));
    onAgentFeedback(`Loaded saved query: ${saved.label}`);
    onRunQuery(saved.query, { savedQueryId: saved.id });
  }, [onAgentFeedback, onRunQuery, savedQueries]);

  const deleteSelectedQuery = useCallback(() => {
    const id = selectedSavedQueryId || savedQueries[0]?.id;
    if (id) {
      onDeleteSavedQuery(id);
      setSelectedSavedQueryId('');
    }
  }, [onDeleteSavedQuery, savedQueries, selectedSavedQueryId]);

  const statusLine = parseError || queryResult?.warnings?.join(' ') || summary;
  const statusIsError = Boolean(parseError || queryResult?.status === 'error');

  return {
    queryText,
    setQueryText,
    parseError,
    selectedSavedQueryId,
    savedQueries,
    rebuildDisabled,
    statusLine,
    statusIsError,
    run,
    saveQuery,
    applyPreset,
    loadSavedQuery,
    deleteSelectedQuery,
    onClearQuery,
    onRebuildCache,
  };
}
