import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { strings } from '../content/strings.js';
import { formatDurationSec } from '../lib/audio/parseAudioTags.js';

export function AudioPlayer({
  src,
  title,
  artist,
  compact = false,
  className = '',
  onLightBackground = false,
}) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    setPlaying(false);
    setCurrentSec(0);
    setDurationSec(0);
    return undefined;
  }, [src]);

  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || scrubbing) return;
    setCurrentSec(el.currentTime);
    if (Number.isFinite(el.duration)) setDurationSec(el.duration);
  }, [scrubbing]);

  const onLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    setDurationSec(el.duration);
  }, []);

  const onEnded = useCallback(() => {
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setCurrentSec(0);
    setPlaying(false);
  }, []);

  const onScrub = useCallback((e) => {
    const el = audioRef.current;
    if (!el) return;
    const v = Number(e.target.value);
    el.currentTime = v;
    setCurrentSec(v);
  }, []);

  const max = durationSec > 0 ? durationSec : 0;
  const btnClass = compact
    ? `p-1 rounded border text-secondary hover:text-primary hover:border-accent/40 ${
        onLightBackground
          ? 'border-black/20 bg-black/5'
          : 'border-border bg-surface'
      }`
    : `p-1.5 rounded-md border text-secondary hover:text-primary hover:border-accent/40 ${
        onLightBackground
          ? 'border-black/20 bg-black/5'
          : 'border-border bg-surface'
      }`;
  const titleClass = onLightBackground ? 'text-gray-900' : 'text-primary';
  const artistClass = onLightBackground ? 'text-gray-600' : 'text-muted';
  const timeClass = onLightBackground ? 'text-gray-600' : 'text-muted';

  return (
    <div
      className={`flex flex-col gap-1.5 min-h-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        className="hidden"
      />
      <div className="min-w-0">
        <div
          className={`sans truncate ${titleClass} ${compact ? 'text-[10px]' : 'text-xs'}`}
          title={title}
        >
          {title || strings.audio.untitled}
        </div>
        {artist && (
          <div
            className={`sans truncate ${artistClass} ${compact ? 'text-[9px]' : 'text-[10px]'}`}
            title={artist}
          >
            {artist}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btnClass}
          onClick={togglePlay}
          aria-label={playing ? strings.audio.pause : strings.audio.play}
          title={playing ? strings.audio.pause : strings.audio.play}
        >
          {playing ? <Pause size={compact ? 12 : 14} /> : <Play size={compact ? 12 : 14} />}
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={stop}
          aria-label={strings.audio.stop}
          title={strings.audio.stop}
        >
          <Square size={compact ? 12 : 14} />
        </button>
        <span className={`sans tabular-nums shrink-0 ${timeClass} ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {formatDurationSec(currentSec)}
          {max > 0 ? ` / ${formatDurationSec(max)}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max || 100}
        step={0.1}
        value={max ? Math.min(currentSec, max) : 0}
        disabled={!max}
        onChange={onScrub}
        onPointerDown={() => setScrubbing(true)}
        onPointerUp={() => setScrubbing(false)}
        className="w-full h-1 accent-accent cursor-pointer disabled:opacity-40"
        aria-label={strings.audio.scrub}
      />
    </div>
  );
}
