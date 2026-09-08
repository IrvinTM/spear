import { redirect } from 'next/navigation';
import { isVaultInitialized } from '@/lib/vault';
import { getActivityLogs } from './actions';
import { LiveToggle } from './client';

export const dynamic = 'force-dynamic';

const levelClass = {
  info: 'text-accent-300 bg-accent-500/15',
  warning: 'text-warning bg-warning/10',
  error: 'text-danger bg-danger/10',
};

export default async function LogsPage() {
  if (!(await isVaultInitialized())) redirect('/setup');
  const logs = await getActivityLogs();

  return (
    <>
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Activity logs</h1>
          <p className="text-sm text-stone-400">Recent local Moodle, download, sync, and AI request activity.</p>
        </div>
        <LiveToggle />
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-stone-500 italic">No activity has been recorded yet.</p>
      ) : (
        <div className="min-w-0 max-w-full">
          {/* Mobile Card List (md:hidden) */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {logs.map((log) => (
              <div key={log.id} className="bg-stone-900/95 border border-white/[0.08] rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${levelClass[log.level]}`}>
                    {log.level}
                  </span>
                  <span className="text-[11px] text-stone-400 font-medium px-1.5 py-0.5 rounded-md bg-white/[0.06]">
                    {log.category.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-stone-500 ml-auto whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <p className="text-stone-200 text-xs font-medium break-words">{log.message}</p>
                {log.url && (
                  <p className="text-[11px] text-stone-500 break-all font-mono">
                    {log.method ? `${log.method} ` : ''}{log.url}
                  </p>
                )}

                {(log.statusCode || log.durationMs !== null || log.details) && (
                  <div className="pt-1.5 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-stone-500">
                    <span>
                      {log.statusCode ? `Status: ${log.statusCode}` : ''}
                      {log.statusCode && log.durationMs !== null ? ' · ' : ''}
                      {log.durationMs !== null ? `${log.durationMs}ms` : ''}
                    </span>
                    {log.details && (
                      <span className="text-[10px] text-stone-400 truncate max-w-[150px]">
                        {log.details}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table View (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto bg-stone-900/95 border border-white/[0.08] rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-stone-500 border-b border-white/[0.06]">
                <tr>
                  <th className="p-4 font-medium">Time</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium">Event</th>
                  <th className="p-4 font-medium">Result</th>
                  <th className="p-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-white/[0.04] last:border-0 align-top">
                    <td className="p-4 text-xs text-stone-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="p-4"><span className="text-xs text-stone-400">{log.category.replace('_', ' ')}</span></td>
                    <td className="p-4 min-w-60">
                      <p className="text-stone-200">{log.message}</p>
                      {log.url && <p className="mt-1 text-xs text-stone-500 break-all">{log.method ? `${log.method} ` : ''}{log.url}</p>}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`inline-flex rounded px-2 py-1 text-xs ${levelClass[log.level]}`}>{log.level}</span>
                      {(log.statusCode || log.durationMs !== null) && <p className="mt-1 text-xs text-stone-500">{log.statusCode ? `${log.statusCode} · ` : ''}{log.durationMs !== null ? `${log.durationMs}ms` : ''}</p>}
                    </td>
                    <td className="p-4 max-w-xs"><pre className="whitespace-pre-wrap break-words text-xs text-stone-500 font-sans">{log.details || '—'}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
