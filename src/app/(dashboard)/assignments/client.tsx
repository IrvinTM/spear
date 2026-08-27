'use client';

import { useState } from 'react';
import type { AssignmentWithDraft } from './actions';
import { startDraftGeneration, getDraftStatus } from '@/app/(dashboard)/dashboard/actions';
import { useRouter } from 'next/navigation';

function DraftStatus({ status }: { status: string | null }) {
  if (!status) return null;
  const configs = {
    completed: 'bg-success/10 text-success',
    running: 'bg-pale-700/30 text-pale-300',
    failed: 'bg-danger/10 text-danger',
  };
  const labels = { completed: '✓ Draft ready', running: '⟳ Drafting...', failed: '✗ Failed' };
  const cls = configs[status as keyof typeof configs] ?? 'bg-stone-700/50 text-stone-400';
  const label = labels[status as keyof typeof labels] ?? status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
      {label}
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
    <div className="bg-stone-900 border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-white/[0.04]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-sm font-semibold text-stone-100">{assignment.name}</h3>
            <DraftStatus status={draftStatus} />
          </div>
          <p className="text-xs text-stone-500">{assignment.courseName}</p>
          {assignment.dueDate && (
            <p className="text-xs text-stone-500 mt-0.5">
              Due: {new Date(assignment.dueDate).toLocaleDateString('es-SV', { dateStyle: 'medium' })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {draftStatus === 'completed' ? (
            <>
              <button
                onClick={() => handleGenerateDraft(true)}
                className="px-3 py-1.5 text-xs font-medium text-stone-300 bg-stone-800/50 hover:bg-stone-700 rounded-lg border border-white/10 transition-colors cursor-pointer"
              >
                ⟳ Regenerate
              </button>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg border border-white/10 transition-colors cursor-pointer"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button
                onClick={() => setEditing(!editing)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-accent-600 hover:bg-accent-500 rounded-lg transition-colors cursor-pointer"
              >
                {editing ? 'Collapse' : 'Edit Draft'}
              </button>
            </>
          ) : draftStatus === 'running' ? (
            <span className="text-xs text-stone-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-pale-400 animate-pulse" />
              Working...
            </span>
          ) : (
            <button
              onClick={() => handleGenerateDraft()}
              disabled={!assignment.todoId}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent-600 hover:bg-accent-500 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Generate Draft
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {cleanIntro && !editing && (
        <div className="px-5 py-3 text-xs text-stone-400 leading-relaxed border-b border-white/[0.04]">
          <p className="font-medium text-stone-500 mb-1 uppercase tracking-wider text-[10px]">Instructions</p>
          <p className="line-clamp-3">{cleanIntro}</p>
        </div>
      )}

      {/* Inline editor */}
      {editing && draftStatus === 'completed' && (
        <div className="flex flex-col">
          <textarea
            className="w-full bg-stone-950 text-stone-200 text-sm font-mono p-5 resize-none outline-none leading-relaxed min-h-[400px]"
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
    <div className="grid gap-5">
      {assignments.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          <p className="text-4xl mb-3">📝</p>
          <p className="font-medium">No assignments found</p>
          <p className="text-sm mt-1">Sync Moodle from the dashboard to load your assignments.</p>
        </div>
      ) : (
        assignments.map((a) => <AssignmentCard key={a.id} assignment={a} />)
      )}
    </div>
  );
}
