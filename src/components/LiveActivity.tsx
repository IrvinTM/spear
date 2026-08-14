'use client';

import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  id: number;
  category: string;
  level: string;
  message: string;
  method: string | null;
  url: string | null;
  status_code: number | null;
  duration_ms: number | null;
  details: string | null;
  created_at: string;
}

const categoryColors: Record<string, string> = {
  sync: 'bg-accent-500/20 text-accent-400',
  chat: 'bg-purple-500/20 text-purple-400',
  agy_call: 'bg-blue-500/20 text-blue-400',
  moodle_api: 'bg-emerald-500/20 text-emerald-400',
  file_download: 'bg-amber-500/20 text-amber-400',
};

const levelDot: Record<string, string> = {
  info: 'bg-stone-400',
  warning: 'bg-warning',
  error: 'bg-danger',
};

export function LiveActivity({ onSyncEvent }: { onSyncEvent?: (type: 'started' | 'completed' | 'failed') => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);

  useEffect(() => {
    const es = new EventSource(`/api/logs/stream?since=${lastIdRef.current}`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry;
        lastIdRef.current = entry.id;

        setLogs((prev) => [...prev.slice(-199), entry]);

        if (entry.category === 'sync') {
          if (entry.message.toLowerCase().includes('started')) onSyncEvent?.('started');
          else if (entry.message.toLowerCase().includes('completed')) onSyncEvent?.('completed');
          else if (entry.level === 'error') onSyncEvent?.('failed');
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => es.close();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] text-xs text-stone-500">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-stone-600'}`} />
        {connected ? 'Live' : 'Connecting...'}
        <span className="ml-auto">{logs.length} events</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 scroll-smooth">
        {logs.length === 0 && (
          <p className="text-xs text-stone-600 text-center py-8">Waiting for activity...</p>
        )}
        {logs.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 text-xs py-1 px-1 rounded hover:bg-white/[0.02] animate-fade-in">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${levelDot[entry.level] || levelDot.info}`} />
            <span className="text-stone-600 shrink-0 font-mono" suppressHydrationWarning>
              {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${categoryColors[entry.category] || 'bg-stone-700/50 text-stone-400'}`}>
              {entry.category.replace('_', ' ')}
            </span>
            <span className="text-stone-300 truncate">{entry.message}</span>
            {entry.duration_ms !== null && (
              <span className="text-stone-600 shrink-0 ml-auto">{entry.duration_ms}ms</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
