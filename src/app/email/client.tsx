'use client';

import { useState, useTransition } from 'react';
import { triggerEmailSync, type EmailItem } from './actions';

export function EmailClient({ initialEmails }: { initialEmails: EmailItem[] }) {
  const [emails, setEmails] = useState(initialEmails);
  const [isSyncing, startSync] = useTransition();
  const [masterPassword, setMasterPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');

  const handleSync = () => {
    if (!masterPassword) {
      setShowPasswordModal(true);
      return;
    }
    doSync();
  };

  const doSync = () => {
    setSyncError('');
    setSyncSuccessMsg('');
    startSync(async () => {
      const formData = new FormData();
      formData.append('masterPassword', masterPassword);
      const result = await triggerEmailSync(formData);
      if (!result.success) {
        setSyncError(result.error || 'Sync failed');
      } else {
        setSyncSuccessMsg(`Synced ${result.emailsFetched} emails. Created ${result.todosCreated} todos.`);
        // Reload page to get new emails easily
        window.location.reload();
      }
    });
  };

  return (
    <div className="min-h-screen bg-stone-950 flex">
      {/* Sidebar */}
      <aside className="w-60 h-screen fixed top-0 left-0 bg-stone-900 border-r border-white/[0.06] flex flex-col p-6 z-50 max-md:hidden">
        <div className="flex items-center gap-3 px-3 mb-8">
          <div className="w-7 h-7 rounded-md bg-accent-600 flex items-center justify-center text-sm font-bold text-white">
            C
          </div>
          <span className="text-base font-semibold tracking-tight">Spear</span>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <a href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-all">
            <span className="w-5 text-center">📋</span>
            Todos
          </a>
          <a href="/materials" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-all">
            <span className="w-5 text-center">📚</span>
            Materials
          </a>
          <a href="/email" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-accent-500/10 text-accent-400">
            <span className="w-5 text-center">✉️</span>
            Email
          </a>
        </nav>

        <div className="border-t border-white/[0.06] pt-4">
          <a href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-all">
            <span className="w-5 text-center">⚙️</span>
            Settings
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-60 max-md:ml-0 flex-1 min-h-screen p-8 max-md:p-4">
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
      </main>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-white/[0.06] rounded-2xl p-8 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-2">Unlock vault</h2>
            <p className="text-sm text-stone-400 mb-6">Master password needed for Gmail access.</p>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSync()}
              autoFocus
              className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 mb-4 focus:border-accent-500 outline-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 px-4 py-2 bg-stone-700 rounded-lg">Cancel</button>
              <button onClick={() => { setShowPasswordModal(false); doSync(); }} className="flex-1 px-4 py-2 bg-accent-600 rounded-lg">Sync</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
