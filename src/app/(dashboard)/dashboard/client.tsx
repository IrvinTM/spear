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
import { Eye, EyeOff } from 'lucide-react';
import { QuickAskBar } from '@/components/QuickAskBar';
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
  const [characterHidden, setCharacterHidden] = useState<boolean>(hideCharacter);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('spear_hide_character');
      if (stored !== null) {
        setCharacterHidden(stored === 'true');
      }
    } catch {}
  }, []);

  const toggleCharacter = () => {
    setCharacterHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('spear_hide_character', String(next));
      } catch {}
      return next;
    });
  };

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
      {/* Character — placed beside widgets on desktop, and as a dedicated hero card at the top on mobile */}
      {/* Desktop: Pinned to the right side next to widgets */}
      {!characterHidden && (
        <div className="fixed top-12 bottom-24 right-4 w-[380px] xl:w-[460px] z-0 pointer-events-none hidden md:block transition-all duration-300">
          <CharacterViewer
            characterUrl={`/api/characters/${activeCharacter}`}
            animationUrl={activeAnimation !== 'procedural' ? `/api/animations/${activeAnimation}` : undefined}
            talkingAnimationUrl={activeTalkingAnimation !== 'procedural' ? `/api/animations/${activeTalkingAnimation}` : undefined}
            pose={characterPose}
            className="w-full h-full pointer-events-none"
          />
        </div>
      )}

      {/* Mobile: Prominent top hero card with live status and 1-tap hide/show toggle */}
      <div className="md:hidden w-full mb-4 relative z-20 pointer-events-auto">
        {!characterHidden ? (
          <div className="cyber-glass rounded-2xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.06] bg-stone-900/50">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${characterPose === 'speaking' ? 'bg-success animate-pulse' : characterPose === 'thinking' ? 'bg-warning animate-pulse' : 'bg-accent-400'}`} />
                <span className="text-xs font-medium text-stone-200">Campus Copilot 3D</span>
                <span className="text-[10px] text-stone-500 capitalize">· {characterPose}</span>
              </div>
              <button
                onClick={toggleCharacter}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-stone-200 text-xs transition-colors cursor-pointer"
                title="Ocultar personaje 3D"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ocultar</span>
              </button>
            </div>
            <div className="w-full h-[280px] relative pointer-events-none">
              <CharacterViewer
                characterUrl={`/api/characters/${activeCharacter}`}
                animationUrl={activeAnimation !== 'procedural' ? `/api/animations/${activeAnimation}` : undefined}
                talkingAnimationUrl={activeTalkingAnimation !== 'procedural' ? `/api/animations/${activeTalkingAnimation}` : undefined}
                pose={characterPose}
                className="w-full h-full pointer-events-none"
              />
            </div>
          </div>
        ) : (
          <button
            onClick={toggleCharacter}
            className="w-full flex items-center justify-between px-4 py-2.5 cyber-glass rounded-xl text-xs text-stone-200 hover:text-white shadow-md transition-all cursor-pointer"
            title="Mostrar personaje 3D"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-400" />
              <span className="font-medium text-stone-200">Campus Copilot 3D</span>
              <span className="text-stone-500 text-[11px]">(Oculto)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-accent-400 text-xs font-semibold">
              <Eye className="w-3.5 h-3.5" />
              <span>Mostrar personaje</span>
            </div>
          </button>
        )}
      </div>

      {/* Mobile Quick Ask Bar — placed directly under the Copilot avatar for quick interaction */}
      <div className="md:hidden w-full mb-4 relative z-20 pointer-events-auto">
        <QuickAskBar />
      </div>

      {/* Sync error — top overlay */}
      {syncError && (
        <div className="relative z-20 mb-4">
          <AlertBanner variant="error" title="Sync Failed" message={syncError} />
        </div>
      )}

      {/* Bottom controls area — Desktop QuickAskBar + Status & Sync bar */}
      <div className={`fixed bottom-0 max-md:bottom-16 right-0 z-20 max-md:left-0 pointer-events-none transition-all duration-300 ${collapsed ? 'left-0' : 'md:left-60'}`}>
        <div className="flex flex-col gap-2 mx-6 mb-6 max-md:mx-3 max-md:mb-2">
          {/* Quick Ask Bar on Desktop */}
          <div className="hidden md:block max-w-xl">
            <QuickAskBar />
          </div>

          {/* Compact status bar */}
          <div className="pointer-events-auto flex items-center gap-3 max-md:gap-2 px-4 py-2.5 max-md:px-3 max-md:py-2 cyber-glass rounded-xl shadow-lg">
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
              <span className={`w-1.5 h-1.5 rounded-full ${activeTodos.length > 0 ? 'bg-accent-400' : 'bg-stone-600'}`} />
              {activeTodos.length} active homework{activeTodos.length !== 1 ? 's' : ''}
            </div>

            {/* Avatar Toggle Button */}
            <button
              onClick={toggleCharacter}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-stone-400 hover:text-stone-200 border border-white/[0.08] transition-colors text-xs cursor-pointer"
              title={characterHidden ? 'Mostrar Personaje 3D' : 'Ocultar Personaje 3D'}
            >
              {characterHidden ? <Eye className="w-3.5 h-3.5 text-accent-400" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{characterHidden ? 'Avatar' : 'Ocultar'}</span>
            </button>

            {/* Sync button */}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500 text-white text-xs font-medium hover:bg-accent-400 active:bg-accent-600 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {isSyncing ? <><span className="spinner spinner--sm" /> Syncing</> : 'Sync'}
            </button>
          </div>
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
