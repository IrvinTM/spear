'use client';

import { useState, useEffect, useRef } from 'react';

interface BriefingData {
  hasSummary: boolean;
  snapshotId?: number;
  summaryText?: string;
  isRead?: boolean;
  isEmpty?: boolean;
  createdAt?: string;
  diff?: {
    newCourses: string[];
    newAssignments: { name: string; courseName: string; dueDate: string | null }[];
    newMaterials: { name: string; courseName: string; type: string }[];
    filesDownloaded: { filename: string }[];
    newTodos: { title: string }[];
  };
}

export function SyncBriefing({ onPlayStateChange }: { onPlayStateChange?: (playing: boolean) => void }) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/sync/summary')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data?.hasSummary) return null;

  const handleListen = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      onPlayStateChange?.(false);
      return;
    }

    setIsAudioLoading(true);
    try {
      const res = await fetch(`/api/sync/summary/audio?id=${data.snapshotId}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Audio unavailable');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => { setIsPlaying(true); onPlayStateChange?.(true); };
      audio.onended = () => { setIsPlaying(false); onPlayStateChange?.(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setIsPlaying(false); onPlayStateChange?.(false); URL.revokeObjectURL(url); };
      audio.play();
    } catch (err) {
      console.error('Briefing audio error:', err);
    } finally {
      setIsAudioLoading(false);
    }
  };

  return (
    <div className="mb-6 bg-stone-900 border border-white/[0.06] rounded-xl p-5 shadow-sm animate-fade-in">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-stone-200">State Briefing</h3>
          <span className="text-xs text-stone-500">
            {data.createdAt ? new Date(data.createdAt).toLocaleString() : ''}
          </span>
        </div>
      </div>


      {/* Summary text */}
      <p className="text-sm text-stone-300 leading-relaxed mb-4">
        {data.summaryText || 'Generating summary...'}
      </p>

      {/* Quick stats chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(data.diff?.newAssignments?.length ?? 0) > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning">
            {data.diff!.newAssignments.length} new assignment{data.diff!.newAssignments.length > 1 ? 's' : ''}
          </span>
        )}
        {(data.diff?.newMaterials?.length ?? 0) > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-accent-500/10 text-accent-400">
            {data.diff!.newMaterials.length} new material{data.diff!.newMaterials.length > 1 ? 's' : ''}
          </span>
        )}
        {(data.diff?.filesDownloaded?.length ?? 0) > 0 && (
          <span className="text-xs px-2 py-1 rounded-full bg-success/10 text-success">
            {data.diff!.filesDownloaded.length} file{data.diff!.filesDownloaded.length > 1 ? 's' : ''} downloaded
          </span>
        )}
      </div>

      {/* Listen button */}
      <button
        onClick={handleListen}
        disabled={isAudioLoading}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-800 border border-white/[0.06] text-sm text-stone-300 hover:bg-stone-700 hover:text-stone-100 transition-all disabled:opacity-40"
      >
        {isAudioLoading ? (
          <><span className="spinner spinner--sm" /> Preparing audio...</>
        ) : isPlaying ? (
          <>⏸ Pause</>
        ) : (
          <>🔊 Listen to briefing</>
        )}
      </button>
    </div>
  );
}
