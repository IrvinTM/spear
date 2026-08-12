'use client';

import { useState, useTransition } from 'react';
import { triggerEmailSync } from './actions';
import { createSessionAction } from '../dashboard/actions';
import type { EmailItem } from '@/lib/types';

export function EmailClient({ initialEmails }: { initialEmails: EmailItem[] }) {
  const [emails, setEmails] = useState(initialEmails);
  const [isSyncing, startSync] = useTransition();
  const [masterPassword, setMasterPassword] = useState('');
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

  const submitModal = () => {
    setSyncError('');
    setSyncSuccessMsg('');
    startSync(async () => {
      const formData = new FormData();
      formData.append('masterPassword', masterPassword);
      const authResult = await createSessionAction(formData);
      if (!authResult.success) {
        setSyncError(authResult.error || 'Auth failed');
        return;
      }
      setMasterPassword(''); // clear from client state
      // Now actually sync
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
          <div className="mb-6 p-4 rounded-lg bg-danger/[0.08] border border-danger/20 text-sm text-red-300">
            ❌ {syncError}
          </div>
        )}

        {syncSuccessMsg && (
          <div className="mb-6 p-4 rounded-lg bg-success/[0.08] border border-success/20 text-sm text-green-300">
            ✅ {syncSuccessMsg}
          </div>
        )}

        {emails.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4 opacity-30">✉️</div>
            <h2 className="text-lg font-semibold mb-2">Inbox Empty</h2>
            <p className="text-sm text-stone-400 max-w-xs mx-auto mb-6">
              Click &quot;Sync Gmail&quot; to fetch your institutional emails from the last 14 days.
            </p>
          </div>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-white/[0.06] rounded-2xl p-8 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-2">Unlock vault</h2>
            <p className="text-sm text-stone-400 mb-6">Master password needed for Gmail access.</p>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitModal()}
              autoFocus
              className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 mb-4 focus:border-accent-500 outline-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 px-4 py-2 bg-stone-700 rounded-lg">Cancel</button>
              <button onClick={() => { setShowPasswordModal(false); submitModal(); }} className="flex-1 px-4 py-2 bg-accent-600 rounded-lg">Sync</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
