'use client';

import { useState, useTransition, useMemo } from 'react';
import { RotateCw, Mail, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Copy, Check, Search, Calendar, User } from 'lucide-react';
import { PasswordModal } from '@/components/PasswordModal';
import { EmptyState } from '@/components/EmptyState';
import { AlertBanner } from '@/components/AlertBanner';
import { triggerEmailSync } from './actions';
import { createSessionAction } from '../dashboard/actions';
import type { EmailItem } from '@/lib/types';

function formatEmailDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function EmailClient({ initialEmails }: { initialEmails: EmailItem[] }) {
  const [emails] = useState(initialEmails);
  const [isSyncing, startSync] = useTransition();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyDeadlines, setOnlyDeadlines] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const filteredEmails = useMemo(() => {
    return emails.filter((e) => {
      if (onlyDeadlines && !e.hasDeadline) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.subject.toLowerCase().includes(q) ||
        (e.fromName && e.fromName.toLowerCase().includes(q)) ||
        e.fromAddress.toLowerCase().includes(q) ||
        (e.summary && e.summary.toLowerCase().includes(q))
      );
    });
  }, [emails, searchQuery, onlyDeadlines]);

  const handleCopySummary = async (id: number, text: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
    <div className="w-full max-w-full min-w-0 overflow-hidden space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-stone-100 mb-0.5">Correo Institucional</h1>
          <p className="text-xs sm:text-sm text-stone-400">
            Bandeja resumida con detección automática de fechas límite.
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-pale-800 text-pale-200 text-xs sm:text-sm font-medium border border-pale-600/40 shadow-sm hover:bg-pale-700 active:bg-pale-900 transition-all cursor-pointer disabled:opacity-40 shrink-0"
        >
          {isSyncing ? (
            <>
              <span className="spinner spinner--sm" />
              <span>Sincronizando…</span>
            </>
          ) : (
            <>
              <RotateCw className="w-3.5 h-3.5" />
              <span>Sincronizar Gmail</span>
            </>
          )}
        </button>
      </div>

      {syncError && <AlertBanner variant="error" message={syncError} />}
      {syncSuccessMsg && <AlertBanner variant="success" message={syncSuccessMsg} />}

      {/* Search & Filter Controls */}
      {emails.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en correos..."
              className="w-full bg-stone-900 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-stone-200 placeholder-stone-500 outline-none focus:border-pale-500 transition-colors"
            />
          </div>
          <button
            onClick={() => setOnlyDeadlines((v) => !v)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
              onlyDeadlines
                ? 'bg-warning/20 border-warning/40 text-warning'
                : 'bg-stone-900 border-white/[0.08] text-stone-400 hover:text-stone-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Fechas límite ({emails.filter((e) => e.hasDeadline).length})</span>
          </button>
        </div>
      )}

      {/* Emails List */}
      {emails.length === 0 ? (
        <EmptyState
          icon={<Mail className="w-12 h-12 stroke-[1.5]" />}
          title="Bandeja Vacía"
          description='Haz clic en "Sincronizar Gmail" para descargar los correos institucionales de los últimos 14 días.'
        />
      ) : filteredEmails.length === 0 ? (
        <div className="text-center py-12 text-stone-500 bg-stone-900/40 rounded-xl border border-white/[0.04]">
          <p className="text-sm font-medium">No se encontraron correos</p>
          <p className="text-xs mt-1">Prueba cambiando los filtros de búsqueda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredEmails.map((email) => {
            const isExpanded = expandedId === email.id;
            const senderDisplay = email.fromName || email.fromAddress;

            return (
              <div
                key={email.id}
                className={`bg-stone-900 border transition-all rounded-xl overflow-hidden ${
                  isExpanded ? 'border-pale-600/40 shadow-lg' : 'border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                {/* Compact Item Header (always visible, click to toggle) */}
                <div
                  onClick={() => toggleExpand(email.id)}
                  className="p-3.5 sm:p-4 cursor-pointer flex flex-col gap-1.5 transition-colors select-none"
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-stone-800 border border-white/[0.06] flex items-center justify-center text-[10px] font-bold text-pale-300 shrink-0">
                        {senderDisplay.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-stone-200 truncate">
                        {senderDisplay}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {email.hasDeadline && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/15 border border-warning/30 text-[10px] font-medium text-warning">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Límite</span>
                        </span>
                      )}
                      <span className="text-[11px] text-stone-500 whitespace-nowrap">
                        {formatEmailDate(email.receivedAt)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-stone-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-stone-500" />
                      )}
                    </div>
                  </div>

                  <h3 className="text-xs sm:text-sm font-medium text-stone-100 truncate">
                    {email.subject || '(Sin asunto)'}
                  </h3>

                  {!isExpanded && email.summary && (
                    <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed break-words">
                      {email.summary}
                    </p>
                  )}
                </div>

                {/* Expanded Full Reading View */}
                {isExpanded && (
                  <div className="px-3.5 pb-4 pt-1 sm:px-4 border-t border-white/[0.04] bg-stone-950/40 space-y-3">
                    {/* Full Metadata */}
                    <div className="flex flex-col gap-1 text-xs text-stone-400 pt-2 min-w-0">
                      <div className="flex items-start gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" />
                        <span className="text-stone-300 break-all">
                          {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span>Recibido: {new Date(email.receivedAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Deadline Notice */}
                    {email.hasDeadline && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/25 text-xs text-warning font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Fecha límite detectada e incorporada a Tareas.</span>
                      </div>
                    )}

                    {/* AI Summary Card */}
                    <div className="bg-stone-950 rounded-xl p-3.5 sm:p-4 border border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-pale-400 text-xs font-semibold uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Resumen IA</span>
                        </div>
                        {email.summary && (
                          <button
                            onClick={(e) => handleCopySummary(email.id, email.summary, e)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-stone-900 border border-white/[0.08] text-[11px] text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
                            title="Copiar resumen"
                          >
                            {copiedId === email.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm text-stone-200 leading-relaxed whitespace-pre-line break-words">
                        {email.summary || 'Sin resumen disponible.'}
                      </p>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => toggleExpand(email.id)}
                        className="text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                      >
                        Cerrar detalle
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showPasswordModal && (
        <PasswordModal
          description="Contraseña maestra requerida para sincronizar Gmail institucional."
          submitLabel="Sincronizar"
          onSubmit={(pw) => {
            setShowPasswordModal(false);
            submitModal(pw);
          }}
          onCancel={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  );
}
