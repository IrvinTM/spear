'use client';

import { useState, useTransition } from 'react';
import { CopilotChat } from '@/components/CopilotChat';
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
}: {
  initialSyncStatus: SyncStatus;
  initialTodos: TodoItem[];
}) {
  const [syncStatus, setSyncStatus] = useState(initialSyncStatus);
  const [todos, setTodos] = useState(initialTodos);
  const [isSyncing, startSync] = useTransition();
  const [masterPassword, setMasterPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [syncError, setSyncError] = useState('');

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

  const submitModal = () => {
    startSync(async () => {
      setSyncError('');
      const formData = new FormData();
      formData.append('masterPassword', masterPassword);
      const authResult = await createSessionAction(formData);
      if (!authResult.success) {
        setSyncError(authResult.error || 'Auth failed');
        return;
      }
      setMasterPassword(''); // clear from client state
      // Now actually sync
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
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Todos</h1>
            <p className="text-sm text-stone-400">
              {todos.length === 0
                ? 'No active tasks. Sync with Moodle to get started.'
                : `${todos.length} active task${todos.length === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
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
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <span className="text-red-400 mt-0.5">❌</span>
            <div>
              <p className="font-medium text-red-200">Sync Failed</p>
              <p className="text-sm text-red-400/80 mt-1">{syncError}</p>
            </div>
          </div>
        )}
        
        {/* Chat Bot Area */}
        <div className="flex flex-col mb-8 max-w-4xl">
          <h2 className="text-lg font-semibold mb-4">Tu Copiloto Universitario</h2>
          <CopilotChat />
        </div>

        {/* Sync stats (when data exists) */}
        {syncStatus.status !== 'never' && (
          <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-4 mb-8">
            {[
              { label: 'Courses', value: syncStatus.coursesCount, icon: '📖' },
              { label: 'Assignments', value: syncStatus.assignmentsCount, icon: '📝' },
              { label: 'Active Todos', value: syncStatus.todosCount, icon: '✅' },
            ].map(({ label, value, icon }) => (
              <div
                key={label}
                className="bg-stone-900 border border-white/[0.06] rounded-xl p-5 shadow-sm"
              >
                <div className="flex items-center gap-2 text-stone-400 text-xs font-medium mb-2">
                  <span>{icon}</span>
                  {label}
                </div>
                <div className="text-2xl font-semibold tracking-tight">{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Todo list */}
        {todos.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4 opacity-30">📋</div>
            <h2 className="text-lg font-semibold mb-2">No tasks yet</h2>
            <p className="text-sm text-stone-400 max-w-xs mx-auto mb-6">
              Click &quot;Sync Moodle&quot; to pull your courses and assignments.
              Todos will be created automatically from upcoming due dates.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-stone-900 border border-white/[0.06] rounded-2xl p-8 shadow-2xl w-full max-w-sm animate-slide-up">
            <h2 className="text-lg font-semibold mb-2">Unlock vault</h2>
            <p className="text-sm text-stone-400 mb-6">
              Enter your master password to sync with Moodle.
            </p>
            <input
              type="password"
              placeholder="Master password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && masterPassword) {
                  setShowPasswordModal(false);
                  submitModal();
                }
              }}
              autoFocus
              className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-stone-700 text-stone-50 text-sm font-medium border border-white/10 hover:bg-stone-600 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (masterPassword) {
                    setShowPasswordModal(false);
                    submitModal();
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium border border-accent-700 hover:bg-accent-500 hover:shadow-glow transition-all cursor-pointer"
              >
                Unlock & sync
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
