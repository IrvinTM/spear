import { redirect } from 'next/navigation';
import { isVaultInitialized } from '@/lib/vault';
import { getActivityLogs } from './actions';
import { LiveToggle } from './client';

export const dynamic = 'force-dynamic';

const levelClass = {
  info: 'text-accent-400 bg-accent-500/10',
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
        <div className="overflow-x-auto bg-stone-900 border border-white/[0.06] rounded-xl">
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
      )}
    </>
  );
}
