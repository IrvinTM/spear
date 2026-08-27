'use client';

import { useState, useEffect, useTransition } from 'react';
import { PasswordModal } from '@/components/PasswordModal';
import { AlertBanner } from '@/components/AlertBanner';
import { CharacterViewer, CharacterPose } from '@/components/CharacterViewer';
import {
  triggerMoodleSync,
  getSyncStatus,
  getTodos,
  createSessionAction,
} from './actions';
import type { SyncStatus, TodoItem } from '@/lib/types';
import { useSidebar } from '@/components/SidebarContext';

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

/* ------------------------------------------------------------------ */

export function DashboardClient({
  initialSyncStatus,
  initialTodos,
  activeCharacter,
  activeAnimation,
  activeTalkingAnimation,
  hideCharacter,
}: {
  initialSyncStatus: SyncStatus;
  initialTodos: TodoItem[];
  activeCharacter: string;
  activeAnimation: string;
  activeTalkingAnimation: string;
  hideCharacter: boolean;
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
      window.dispatchEvent(new CustomEvent('todos:refresh'));
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
      window.dispatchEvent(new CustomEvent('todos:refresh'));
    });
  };

  const activeTodos = todos.filter((t) => t.status !== 'done');
  const { collapsed } = useSidebar();

  return (
    <>
      {/* Character — centered within the main content area (accounting for sidebar), resting above bottom bar */}
      {!hideCharacter && (
        <div className={`fixed top-0 bottom-20 right-0 max-md:left-0 z-0 pointer-events-none transition-all duration-300 ${collapsed ? 'left-0' : 'left-60'}`}>
          <CharacterViewer
            characterUrl={`/api/characters/${activeCharacter}`}
            animationUrl={activeAnimation !== 'procedural' ? `/api/animations/${activeAnimation}` : undefined}
            talkingAnimationUrl={activeTalkingAnimation !== 'procedural' ? `/api/animations/${activeTalkingAnimation}` : undefined}
            pose={characterPose}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Sync error — top overlay */}
      {syncError && (
        <div className="relative z-10 mb-4">
          <AlertBanner variant="error" title="Sync Failed" message={syncError} />
        </div>
      )}

      {/* Bottom bar — todos + sync, pinned to bottom */}
      <div className={`fixed bottom-0 right-0 z-20 max-md:left-0 pointer-events-none transition-all duration-300 ${collapsed ? 'left-0' : 'left-60'}`}>
        {/* Compact status bar */}
        <div className="pointer-events-auto mx-6 mb-6 flex items-center gap-3 px-4 py-2.5 cyber-glass rounded-xl shadow-lg">
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

          <div className="flex items-center gap-1.5 text-xs text-stone-400 ml-auto">
            <span className={`w-1.5 h-1.5 rounded-full ${activeTodos.length > 0 ? 'bg-pale-400' : 'bg-stone-600'}`} />
            {activeTodos.length} active homework{activeTodos.length !== 1 ? 's' : ''}
          </div>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pale-800 text-pale-300 text-xs font-medium border border-pale-600/40 hover:bg-pale-700 active:bg-pale-900 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
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
