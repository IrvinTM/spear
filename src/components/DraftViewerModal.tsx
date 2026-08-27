'use client';

import { useEffect, useState } from 'react';
import { getDraftStatus } from '@/app/(dashboard)/dashboard/actions';

export function DraftViewerModal({ todoId, title, onClose }: { todoId: number; title: string; onClose: () => void }) {
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      const status = await getDraftStatus(todoId);
      if (status?.draft) setDraft(status.draft);
      setLoading(false);
    };
    void load();
  }, [todoId]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-950 animate-in fade-in duration-150">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-stone-900 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            ←
          </button>
          <div>
            <p className="text-xs text-stone-500">AI Draft</p>
            <p className="text-sm font-medium text-stone-100 truncate max-w-xl">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={loading || !draft}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg border border-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? '✓ Copied!' : 'Copy all'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent-600 hover:bg-accent-500 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-hidden flex">
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-stone-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-pale-400 animate-pulse" />
            Loading draft...
          </div>
        ) : (
          <textarea
            className="flex-1 w-full h-full bg-stone-950 text-stone-200 text-sm font-mono p-8 resize-none outline-none leading-relaxed"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
