import { useEffect, useState } from 'react';
import { getArtifact } from '../lib/agentApi.js';

/**
 * @param {string | null | undefined} artifactRefId
 * @param {boolean} enabled
 */
export function useArtifactPayloadText(artifactRefId, enabled) {
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !artifactRefId) {
      setText(null);
      setLoading(false);
      setError(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setText(null);

    getArtifact(artifactRefId)
      .then(({ artifact }) => {
        if (cancelled) return;
        const payload = artifact?.payload_text?.trim() || '';
        setText(payload || null);
        setError(!payload);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [artifactRefId, enabled]);

  return { text, loading, error };
}
