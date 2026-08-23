'use client';

import { useEffect, useState } from 'react';
import { getTodos, updateTodoStatus } from '@/app/(dashboard)/dashboard/actions';
import type { TodoItem } from '@/lib/types';

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
  in_progress: { label: 'In progress', bg: 'bg-pale-700/30', text: 'text-pale-300', dot: 'bg-pale-400' },
  done: { label: 'Done', bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
};

export function ActiveHomeworksWidget() {
  const [todos, setTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadTodos = async () => {
      const activeTodos = await getTodos();
      if (!cancelled) {
        setTodos(activeTodos.filter((todo) => todo.status !== 'done'));
      }
    };

    void loadTodos();
    const refresh = () => {
      void loadTodos();
    };
    window.addEventListener('todos:refresh', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('todos:refresh', refresh);
    };
  }, []);

  const handleStatusChange = (todoId: number, status: 'pending' | 'in_progress' | 'done') => {
    setTodos((prev) =>
      status === 'done'
        ? prev.filter((t) => t.id !== todoId)
        : prev.map((t) => (t.id === todoId ? { ...t, status } : t)),
    );
    updateTodoStatus(todoId, status);
    window.dispatchEvent(new CustomEvent('todos:refresh'));
  };

  return (
    <div className="cyber-glass rounded-xl p-4 animate-fade-in relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 bg-pale-400/5 rounded-bl-full blur-2xl pointer-events-none" />
      <div className="flex items-center gap-2 mb-3 relative z-10">
        <span className="text-xl">📚</span>
        <h3 className="text-sm font-semibold text-stone-100">Active Homeworks</h3>
      </div>

      <div className="max-h-64 overflow-y-auto relative z-10">
        {todos.length === 0 ? (
          <p className="text-xs text-stone-500">No active homeworks right now.</p>
        ) : (
          <div className="flex flex-col divide-y divide-accent-500/10">
            {todos.map((todo) => {
              const due = formatDueDate(todo.dueDate);
              const cfg = statusConfig[todo.status as keyof typeof statusConfig] || statusConfig.pending;
              return (
                <div key={todo.id} className="flex items-center gap-2 py-2.5">
                  <button
                    onClick={() => handleStatusChange(todo.id, todo.status === 'pending' ? 'in_progress' : 'done')}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer hover:scale-110 transition-all ${
                      todo.status === 'in_progress' ? 'border-pale-400 bg-pale-600/30' : 'border-stone-600 hover:border-stone-400'
                    }`}
                  >
                    {todo.status === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-pale-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-200 truncate">{todo.title}</p>
                    {todo.courseName && <p className="text-[11px] text-stone-500 truncate">{todo.courseName}</p>}
                  </div>
                  <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${cfg.bg} ${cfg.text}`}>
                    <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  <span className={`text-[11px] shrink-0 ${urgencyColors[due.urgency]}`}>{due.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
