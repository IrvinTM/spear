'use client';

import { useState, useEffect, useRef } from 'react';

interface EmailBriefingData {
  hasSummary: boolean;
  summaryText?: string;
  audioText?: string;
  lastSyncAt?: string;
  emails?: { id: number; from_name: string | null; subject: string; summary: string | null; received_at: string }[];
}

export function EmailBriefing({ expanded = true }: { expanded?: boolean }) {
  const [data, setData] = useState<EmailBriefingData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/email/summary')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data?.hasSummary) return null;

  const handleListen = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
      return;
    }

    setIsAudioLoading(true);
    try {
      const textParam = encodeURIComponent(data.audioText || data.summaryText || '');
      const res = await fetch(`/api/email/summary/audio?text=${textParam}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Audio unavailable');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => { setIsPlaying(true); window.dispatchEvent(new CustomEvent('character-pose', { detail: 'speaking' })); };
      audio.onended = () => { setIsPlaying(false); window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' })); URL.revokeObjectURL(url); };
      audio.onerror = () => { setIsPlaying(false); window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' })); URL.revokeObjectURL(url); };
      audio.play();
    } catch (err) {
      console.error('Email briefing audio error:', err);
    } finally {
      setIsAudioLoading(false);
    }
  };

  return (
    <div className="bg-stone-900 border border-white/[0.06] rounded-xl p-4 shadow-sm animate-fade-in">
      {/* Play controls — always visible */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleListen}
          disabled={isAudioLoading}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all cursor-pointer shrink-0 ${
            isPlaying
              ? 'border-accent-400 bg-accent-400/10 shadow-[0_0_12px_rgba(var(--accent-500),0.3)]'
              : 'border-stone-600 bg-stone-800 hover:border-stone-400'
          } disabled:opacity-40`}
        >
          {isAudioLoading ? <span className="spinner spinner--sm" /> : isPlaying ? '⏸' : '🔊'}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-stone-200">Email Briefing</h3>
          <p className="text-xs text-stone-500 truncate" suppressHydrationWarning>
            {isPlaying ? 'Playing...' : isAudioLoading ? 'Loading audio...' : data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : 'Ready'}
          </p>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <p className="text-sm text-stone-300 leading-relaxed mb-4">
            {data.summaryText || 'Generating summary...'}
          </p>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-accent-500/10 text-accent-400">
              {data.emails?.length || 0} unread emails
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
