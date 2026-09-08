'use client';

import { useState } from 'react';
import { Check, AlertCircle, Loader2, RotateCw, Copy, FileText } from 'lucide-react';
import type { AssignmentWithDraft } from './actions';
import { startDraftGeneration, getDraftStatus } from '@/app/(dashboard)/dashboard/actions';

function DraftStatus({ status }: { status: string | null }) {
  if (!status) return null;
  const configs = {
    completed: { cls: 'bg-success/10 text-success border border-success/25', icon: Check, label: 'Draft ready' },
    running: { cls: 'bg-accent-500/15 text-accent-300 border border-accent-500/25', icon: Loader2, label: 'Drafting...' },
    failed: { cls: 'bg-danger/10 text-danger border border-danger/25', icon: AlertCircle, label: 'Failed' },
  };
  const cfg = configs[status as keyof typeof configs];
  if (!cfg) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-stone-300">
        {status}
      </span>
    );
  }
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.cls}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function AssignmentCard({ assignment }: { assignment: AssignmentWithDraft }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(assignment.draft ?? '');
  const [draftStatus, setDraftStatus] = useState(assignment.draftStatus);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanIntro = assignment.intro?.replace(/<[^>]*>/g, '') ?? '';

  const handleGenerateDraft = async (force: boolean = false) => {
    if (!assignment.todoId) return;
    setDraftStatus('running');
    await startDraftGeneration(assignment.todoId, force);
    setPolling(true);
    // Poll every 5s until done
    const interval = setInterval(async () => {
      const result = await getDraftStatus(assignment.todoId);
      if (result?.status === 'completed' || result?.status === 'failed') {
        clearInterval(interval);
        setDraftStatus(result.status);
        if (result.draft) setDraft(result.draft);
        setPolling(false);
      }
    }, 5000);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-stone-900/95 border border-white/[0.08] rounded-xl overflow-hidden min-w-0 max-w-full">
      {/* Header */}
      <div className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 border-b border-white/[0.06] min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5 min-w-0">
            <h3 className="text-sm font-semibold text-stone-100 break-words">{assignment.name}</h3>
            <DraftStatus status={draftStatus} />
          </div>
          <p className="text-xs text-stone-400 truncate">{assignment.courseName}</p>
          {assignment.dueDate && (
            <p className="text-xs text-stone-500 mt-0.5">
              Due: {new Date(assignment.dueDate).toLocaleDateString('es-SV', { dateStyle: 'medium' })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:shrink-0 pt-1 sm:pt-0">
          {draftStatus === 'completed' ? (
            <>
              <button
                onClick={() => handleGenerateDraft(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-200 bg-white/[0.05] hover:bg-white/[0.09] rounded-lg border border-white/[0.08] transition-colors cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                Regenerate
              </button>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-100 bg-white/[0.05] hover:bg-white/[0.09] rounded-lg border border-white/[0.08] transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={() => setEditing(!editing)}
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-accent-500 hover:bg-accent-400 rounded-lg transition-colors cursor-pointer"
              >
                {editing ? 'Collapse' : 'Edit Draft'}
              </button>
            </>
          ) : draftStatus === 'running' ? (
            <span className="text-xs text-stone-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
              Working...
            </span>
          ) : (
            <button
              onClick={() => handleGenerateDraft()}
              disabled={!assignment.todoId}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent-500 hover:bg-accent-400 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Generate Draft
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {cleanIntro && !editing && (
        <div className="p-4 sm:px-5 sm:py-3 text-xs text-stone-400 leading-relaxed border-b border-white/[0.06] min-w-0">
          <p className="font-medium text-stone-500 mb-1 uppercase tracking-wider text-[10px]">Instructions</p>
          <p className="line-clamp-3 break-words">{cleanIntro}</p>
        </div>
      )}

      {/* Inline editor */}
      {editing && draftStatus === 'completed' && (
        <div className="flex flex-col min-w-0">
          <textarea
            className="w-full bg-stone-950 text-stone-200 text-base sm:text-sm font-mono p-4 sm:p-5 resize-none outline-none leading-relaxed min-h-[350px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

export function AssignmentsClient({ assignments }: { assignments: AssignmentWithDraft[] }) {
  return (
    <div className="grid gap-4 sm:gap-5 min-w-0 max-w-full">
      {assignments.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          <div className="flex justify-center mb-3">
            <FileText className="w-10 h-10 text-stone-600 stroke-[1.5]" />
          </div>
          <p className="font-medium">No assignments found</p>
          <p className="text-sm mt-1">Sync Moodle from the dashboard to load your assignments.</p>
        </div>
      ) : (
        assignments.map((a) => <AssignmentCard key={a.id} assignment={a} />)
      )}
    </div>
  );
}
