'use client';

import { useState, useTransition } from 'react';
import { PasswordModal } from '@/components/PasswordModal';
import { EmptyState } from '@/components/EmptyState';
import { AlertBanner } from '@/components/AlertBanner';
import { triggerEmailSync } from './actions';
import { createSessionAction } from '../dashboard/actions';
import type { EmailItem } from '@/lib/types';

export function EmailClient({ initialEmails }: { initialEmails: EmailItem[] }) {
  const [emails, setEmails] = useState(initialEmails);
  const [isSyncing, startSync] = useTransition();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');

  const handleSync = () => {
    doSync();
  };

  const doSync = () => {
    setSyncError('');
    setSyncSuccessMsg('');
    startSync(async () => {
      const result = await triggerEmailSync();
      if (!result.success) {
        if (result.needsAuth) {
          setShowPasswordModal(true);
          return;
        }
        setSyncError(result.error || 'Sync failed');
      } else {
        setSyncSuccessMsg(`Synced ${result.emailsFetched} emails. Created ${result.todosCreated} todos.`);
        window.location.reload();
      }
    });
  };

  const submitModal = (password: string) => {
    setSyncError('');
    setSyncSuccessMsg('');
    startSync(async () => {
      const formData = new FormData();
      formData.append('masterPassword', password);
      const authResult = await createSessionAction(formData);
      if (!authResult.success) {
        setSyncError(authResult.error || 'Auth failed');
        return;
      }
      const result = await triggerEmailSync();
      if (!result.success) {
        setSyncError(result.error || 'Sync failed');
      } else {
        setSyncSuccessMsg(`Synced ${result.emailsFetched} emails. Created ${result.todosCreated} todos.`);
        window.location.reload();
      }
    });
  };

  return (
    <>
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Institutional Email</h1>
            <p className="text-sm text-stone-400">
              Summarized inbox with LLM deadline extraction.
            </p>
          </div>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow transition-all disabled:opacity-40"
          >
            {isSyncing ? <><span className="spinner spinner--sm" /> Syncing…</> : '🔄 Sync Gmail'}
          </button>
        </div>

        {syncError && (
          <AlertBanner variant="error" message={syncError} />
        )}

        {syncSuccessMsg && (
          <AlertBanner variant="success" message={syncSuccessMsg} />
        )}

        {emails.length === 0 ? (
          <EmptyState
            icon="✉️"
            title="Inbox Empty"
            description='Click "Sync Gmail" to fetch your institutional emails from the last 14 days.'
          />
        ) : (
          <div className="grid gap-4">
            {emails.map((email) => (
              <div key={email.id} className="bg-stone-900 border border-white/[0.06] rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <h3 className="font-medium text-stone-200">{email.subject}</h3>
                  <span className="text-xs text-stone-500 whitespace-nowrap">
                    {new Date(email.receivedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-sm text-stone-400 mb-4">
                  From: <span className="text-stone-300">{email.fromName || email.fromAddress}</span> ({email.fromAddress})
                </div>
                <div className="bg-stone-950 p-4 rounded-lg border border-white/[0.02]">
                  <h4 className="text-xs font-semibold text-accent-400 mb-2 uppercase tracking-wider">LLM Summary</h4>
                  <p className="text-sm text-stone-300 leading-relaxed">{email.summary}</p>
                </div>
                {email.hasDeadline && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning font-medium">
                    ⚠️ Deadline detected — added to Todos
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {showPasswordModal && (
        <PasswordModal
          description="Master password needed for Gmail access."
          submitLabel="Sync"
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
