'use client';

import { useState, useTransition } from 'react';
import { CopilotChat } from '@/components/CopilotChat';
import { PasswordModal } from '@/components/PasswordModal';
import { EmptyState } from '@/components/EmptyState';
import { AlertBanner } from '@/components/AlertBanner';
import { SyncBriefing } from '@/components/SyncBriefing';
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

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Todos</h1>
            <p className="text-sm text-stone-400 mt-1">
              {todos.filter((t) => t.status === 'done').length} / {todos.length} completed
            </p>
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
            {/* Sync status badge */}
            <div className="flex items-center gap-2 text-xs text-stone-500">
              {syncStatus.status !== 'never' && (
                <>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      syncStatus.status === 'success'
                        ? 'bg-success status-glow-success'
                        : syncStatus.status === 'failed'
                        ? 'bg-danger status-glow-danger'
                        : 'bg-warning status-glow-warning'
                    }`}
                  />
                  <span>Synced {formatRelativeDate(syncStatus.lastSync)}</span>
                </>
              )}
            </div>

            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSyncing ? (
                <>
                  <span className="spinner spinner--sm" />
                  Syncing…
                </>
              ) : (
                <>🔄 Sync Moodle</>
              )}
            </button>
          </div>
        </div>

        {/* Sync error */}
        {syncError && (
          <div className="pointer-events-auto">
            <AlertBanner variant="error" title="Sync Failed" message={syncError} />
          </div>
        )}
        
        {/* Full-screen Character Background */}
        <div className="fixed inset-0 z-0 opacity-40">
          <CharacterViewer 
            characterUrl={`/api/characters/${activeCharacter}`}
            animationUrl={activeAnimation !== 'procedural' ? `/api/animations/${activeAnimation}` : undefined}
            talkingAnimationUrl={activeTalkingAnimation !== 'procedural' ? `/api/animations/${activeTalkingAnimation}` : undefined}
            pose={characterPose}
            className="w-full h-full"
          />
        </div>

        {/* Content Overlay */}
        <div className="relative z-10 grid grid-cols-[300px_1fr_400px] max-lg:grid-cols-1 gap-6 mb-8 mt-4 pointer-events-none">
          {/* Left: Briefing + Stats */}
          <div className="flex flex-col gap-4 max-lg:order-2 pointer-events-auto">
            <SyncBriefing onPlayStateChange={(playing) => setCharacterPose(playing ? 'speaking' : 'idle')} />
            
            {/* Sync stats (when data exists) */}
            {syncStatus.status !== 'never' && (
              <div className="flex flex-col gap-4">
                {[
                  { label: 'Courses', value: syncStatus.coursesCount, icon: '📖' },
                  { label: 'Assignments', value: syncStatus.assignmentsCount, icon: '📝' },
                  { label: 'Active Todos', value: syncStatus.todosCount, icon: '✅' },
                ].map(({ label, value, icon }) => (
                  <div
                    key={label}
                    className="bg-stone-900 border border-white/[0.06] rounded-xl p-5 shadow-sm flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 text-stone-400 text-sm font-medium">
                      <span>{icon}</span>
                      {label}
                    </div>
                    <div className="text-xl font-semibold tracking-tight">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Center: Empty Stage for character to show through */}
          <div className="relative min-h-[400px] max-lg:hidden" />
          
          {/* Right: Copilot Chat */}
          <div className="flex flex-col max-lg:order-3 pointer-events-auto">
            <CopilotChat />
          </div>
        </div>

        {/* Todo list */}
        <div className="pointer-events-none">
          {todos.length === 0 ? (
            <div className="pointer-events-auto">
              <EmptyState
                icon="📋"
                title="No tasks yet"
                description='Click "Sync Moodle" to pull your courses and assignments. Todos will be created automatically from upcoming due dates.'
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2 pointer-events-auto">
              {todos.map((todo, i) => {
                const due = formatDueDate(todo.dueDate);
                const cfg = statusConfig[todo.status as keyof typeof statusConfig] || statusConfig.pending;

                return (
                  <div
                    key={todo.id}
                    className="group bg-stone-900 border border-white/[0.06] rounded-xl p-5 shadow-sm hover:border-white/10 transition-all animate-fade-in"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-start gap-4">
                      {/* Status toggle */}
                      <button
                        onClick={() =>
                          handleStatusChange(
                            todo.id,
                            todo.status === 'pending' ? 'in_progress' : 'done',
                          )
                        }
                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer hover:scale-110 ${
                          todo.status === 'in_progress'
                            ? 'border-accent-400 bg-accent-400/20'
                            : 'border-stone-600 hover:border-stone-400'
                        }`}
                        title={todo.status === 'pending' ? 'Start working' : 'Mark as done'}
                      >
                        {todo.status === 'in_progress' && (
                          <span className="w-2 h-2 rounded-full bg-accent-400" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm leading-snug">{todo.title}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </div>

                        {todo.courseName && (
                          <p className="text-xs text-stone-500 mt-1">{todo.courseName}</p>
                        )}

                        {todo.description && (
                          <p className="text-xs text-stone-400 mt-2 line-clamp-2 leading-relaxed">
                            {todo.description}
                          </p>
                        )}
                      </div>

                      {/* Due date */}
                      <div className={`text-right shrink-0 ${urgencyColors[due.urgency]}`}>
                        <p className="text-xs font-medium">{due.label}</p>
                        {due.urgency === 'overdue' && (
                          <p className="text-[10px] mt-0.5 opacity-75">Overdue</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      {showPasswordModal && (
        <PasswordModal
          description="Enter your master password to sync with Moodle."
          onSubmit={(pw) => {
            setShowPasswordModal(false);
            submitModal(pw);
          }}
          onCancel={() => setShowPasswordModal(false)}
        />
      )}
    </>
  );
}
