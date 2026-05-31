import React, { useEffect, useState } from 'react';
import { strings } from '../content/strings.js';
import {
  createAssertion,
  getAssertionDefaults,
  isApiAvailable,
} from '../lib/primitivesApi.js';

export function AddAssertionForm({ artifactRef, clusterId, variant = 'bottom' }) {
  const [predicate, setPredicate] = useState('');
  const [objectLiteral, setObjectLiteral] = useState('');
  const [defaults, setDefaults] = useState(null);
  const [apiOk, setApiOk] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    (async () => {
      const ok = await isApiAvailable();
      setApiOk(ok);
      if (ok) {
        try {
          const d = await getAssertionDefaults();
          setDefaults(d);
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!predicate.trim() || !clusterId || !artifactRef || !defaults) return;
    setSaving(true);
    setMessage(null);
    try {
      await createAssertion(clusterId, {
        subject_ref: artifactRef,
        predicate: predicate.trim(),
        object_literal: objectLiteral.trim() || predicate.trim(),
        confidence: defaults.confidence,
        scope: defaults.scope,
        status: 'tentative',
        provenance: [artifactRef],
        author_chain: [
          {
            kind: 'human',
            id: 'user:local',
            action: 'created',
            at: new Date().toISOString(),
          },
        ],
      });
      setPredicate('');
      setObjectLiteral('');
      setMessage(strings.assertion.added);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!artifactRef?.id) return null;
  if (apiOk === false) {
    return (
      <p
        className={`sans text-[10px] text-muted italic ${
          isSidebar ? 'px-4 py-3 border-b border-border' : ''
        }`}
      >
        {strings.assertion.apiUnavailable}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={
        isSidebar
          ? 'border-b border-border px-4 py-3'
          : 'mt-4 pt-4 border-t border-border-subtle'
      }
    >
      <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
        {strings.assertion.title}
      </div>
      <input
        value={predicate}
        onChange={(e) => setPredicate(e.target.value)}
        placeholder={strings.assertion.predicatePlaceholder}
        className="w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary mb-2"
      />
      <input
        value={objectLiteral}
        onChange={(e) => setObjectLiteral(e.target.value)}
        placeholder={strings.assertion.objectPlaceholder}
        className="w-full sans text-xs bg-surface-muted border border-border rounded px-2 py-1.5 text-primary mb-2"
      />
      <button
        type="submit"
        disabled={saving || !predicate.trim() || !defaults}
        className="sans text-xs bg-accent text-on-accent px-3 py-1.5 rounded disabled:opacity-50"
      >
        {saving ? strings.assertion.saving : strings.assertion.add}
      </button>
      {message && (
        <p className={`sans text-[10px] mt-2 ${message === strings.assertion.added ? 'text-success' : 'text-danger'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
