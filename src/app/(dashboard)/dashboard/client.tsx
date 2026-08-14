'use client';

import { useState, useEffect, useTransition } from 'react';
import { PasswordModal } from '@/components/PasswordModal';
import { AlertBanner } from '@/components/AlertBanner';
import { CharacterViewer, CharacterPose } from '@/components/CharacterViewer';
import {
  triggerMoodleSync,
  updateTodoStatus,
  getSyncStatus,
  getTodos,
  createSessionAction,
} from './actions';
import type { SyncStatus, TodoItem } from '@/lib/types';

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    if (absDays === 0) return 'Today';
    if (absDays === 1) return 'Yesterday';
    return `${absDays} days ago`;
  }
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueDate(dateStr: string | null): { label: string; urgency: 'overdue' | 'urgent' | 'soon' | 'normal' | 'none' } {
  if (!dateStr) return { label: 'No due date', urgency: 'none' };
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  let urgency: 'overdue' | 'urgent' | 'soon' | 'normal' | 'none';
  if (diffHours < 0) urgency = 'overdue';
  else if (diffHours < 24) urgency = 'urgent';
  else if (diffHours < 72) urgency = 'soon';
  else urgency = 'normal';

  const label = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return { label, urgency };
}

const urgencyColors = {
  overdue: 'text-danger',
  urgent: 'text-warning',
  soon: 'text-yellow-200',
  normal: 'text-stone-400',
  none: 'text-stone-500',
};

const statusConfig = {
  pending: { label: 'Pending', bg: 'bg-stone-700/50', text: 'text-stone-300', dot: 'bg-stone-400' },
  in_progress: { label: 'In progress', bg: 'bg-accent-500/10', text: 'text-accent-400', dot: 'bg-accent-400' },
  done: { label: 'Done', bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
};

/* ------------------------------------------------------------------ */

export function DashboardClient({
  initialSyncStatus,
  initialTodos,
  activeCharacter,
  activeAnimation,
  activeTalkingAnimation,
}: {
  initialSyncStatus: SyncStatus;
  initialTodos: TodoItem[];
  activeCharacter: string;
  activeAnimation: string;
  activeTalkingAnimation: string;
}) {
  const [syncStatus, setSyncStatus] = useState(initialSyncStatus);
  const [todos, setTodos] = useState(initialTodos);
  const [isSyncing, startSync] = useTransition();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [characterPose, setCharacterPose] = useState<CharacterPose>('idle');

  useEffect(() => {
    const handler = (e: Event) => {
      const pose = (e as CustomEvent).detail as CharacterPose;
      setCharacterPose(pose);
    };
    window.addEventListener('character-pose', handler);
    return () => window.removeEventListener('character-pose', handler);
  }, []);

  const handleSync = () => {
    doSync();
  };

  const doSync = () => {
    setSyncError('');
    startSync(async () => {
      const result = await triggerMoodleSync();
      if (!result.success) {
        if (result.needsAuth) {
          setShowPasswordModal(true);
          return;
        }
        setSyncError(result.error || 'Sync failed');
      }
      // Refresh data
      const [newStatus, newTodos] = await Promise.all([getSyncStatus(), getTodos()]);
      setSyncStatus(newStatus);
      setTodos(newTodos);
    });
  };

  const submitModal = (password: string) => {
    startSync(async () => {
      setSyncError('');
      const formData = new FormData();
      formData.append('masterPassword', password);
      const authResult = await createSessionAction(formData);
      if (!authResult.success) {
        setSyncError(authResult.error || 'Auth failed');
        return;
      }
      const result = await triggerMoodleSync();
      if (!result.success) {
        setSyncError(result.error || 'Sync failed');
      }
      const [newStatus, newTodos] = await Promise.all([getSyncStatus(), getTodos()]);
      setSyncStatus(newStatus);
      setTodos(newTodos);
    });
  };

  const handleStatusChange = (todoId: number, status: 'pending' | 'in_progress' | 'done') => {
    // Optimistic update
    setTodos((prev) =>
      status === 'done'
        ? prev.filter((t) => t.id !== todoId)
        : prev.map((t) => (t.id === todoId ? { ...t, status } : t)),
    );
    updateTodoStatus(todoId, status);
  };

  const activeTodos = todos.filter((t) => t.status !== 'done');
  const [todosExpanded, setTodosExpanded] = useState(false);

  return (
    <>
      {/* Character — full screen, center stage */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <CharacterViewer
          characterUrl={`/api/characters/${activeCharacter}`}
          animationUrl={activeAnimation !== 'procedural' ? `/api/animations/${activeAnimation}` : undefined}
          talkingAnimationUrl={activeTalkingAnimation !== 'procedural' ? `/api/animations/${activeTalkingAnimation}` : undefined}
          pose={characterPose}
          className="w-full h-full"
        />
      </div>

      {/* Sync error — top overlay */}
      {syncError && (
        <div className="relative z-10 mb-4">
          <AlertBanner variant="error" title="Sync Failed" message={syncError} />
        </div>
      )}

      {/* Bottom bar — todos + sync, pinned to bottom */}
      <div className="fixed bottom-0 left-60 right-0 z-20 max-md:left-0 pointer-events-none">
        {/* Expandable todo list */}
        {todosExpanded && activeTodos.length > 0 && (
          <div className="pointer-events-auto mx-6 mb-2 max-h-[50vh] overflow-y-auto rounded-xl bg-stone-950/90 backdrop-blur-sm border border-white/[0.06] shadow-2xl">
            <div className="flex flex-col divide-y divide-white/[0.04]">
              {activeTodos.map((todo) => {
                const due = formatDueDate(todo.dueDate);
                const cfg = statusConfig[todo.status as keyof typeof statusConfig] || statusConfig.pending;
                return (
                  <div key={todo.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                    <button
                      onClick={() => handleStatusChange(todo.id, todo.status === 'pending' ? 'in_progress' : 'done')}
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer hover:scale-110 transition-all ${
                        todo.status === 'in_progress' ? 'border-accent-400 bg-accent-400/20' : 'border-stone-600 hover:border-stone-400'
                      }`}
                    >
                      {todo.status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-200 truncate">{todo.title}</p>
                      {todo.courseName && <p className="text-xs text-stone-500 truncate">{todo.courseName}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${cfg.bg} ${cfg.text}`}>
                      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <span className={`text-xs shrink-0 ${urgencyColors[due.urgency]}`}>{due.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Compact status bar */}
        <div className="pointer-events-auto mx-6 mb-6 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-stone-950/80 backdrop-blur-sm border border-white/[0.06] shadow-lg">
          {/* Sync status dot + text */}
          <div className="flex items-center gap-2 text-xs text-stone-500">
            {syncStatus.status !== 'never' && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                syncStatus.status === 'success' ? 'bg-success' : syncStatus.status === 'failed' ? 'bg-danger' : 'bg-warning'
              }`} />
            )}
            <span suppressHydrationWarning className="hidden sm:inline">
              {syncStatus.status === 'never' ? 'Not synced' : `Synced ${formatRelativeDate(syncStatus.lastSync)}`}
            </span>
          </div>

          {/* Stats chips */}
          {syncStatus.status !== 'never' && (
            <div className="hidden md:flex items-center gap-2 text-xs text-stone-500">
              <span>{syncStatus.coursesCount} courses</span>
              <span className="text-stone-700">/</span>
              <span>{syncStatus.assignmentsCount} assignments</span>
            </div>
          )}

          {/* Todos toggle */}
          <button
            onClick={() => setTodosExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors cursor-pointer ml-auto"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeTodos.length > 0 ? 'bg-accent-400' : 'bg-stone-600'}`} />
            {activeTodos.length} todo{activeTodos.length !== 1 ? 's' : ''}
            <span className="text-stone-600">{todosExpanded ? '▼' : '▲'}</span>
          </button>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium border border-accent-700 hover:bg-accent-500 active:bg-accent-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isSyncing ? <><span className="spinner spinner--sm" /> Syncing</> : 'Sync'}
          </button>
        </div>
      </div>

      {showPasswordModal && (
        <PasswordModal
          description="Enter your master password to sync with Moodle."
          onSubmit={(pw) => { setShowPasswordModal(false); submitModal(pw); }}
          onCancel={() => setShowPasswordModal(false)}
        />
      )}
    </>
  );
}
