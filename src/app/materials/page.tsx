import { getMaterials } from './actions';
import { isVaultInitialized } from '@/lib/vault';
import { redirect } from 'next/navigation';

import { CourseSummaryClient } from './CourseSummaryClient';

export default async function MaterialsPage() {
  const vaultExists = await isVaultInitialized();
  if (!vaultExists) {
    redirect('/setup');
  }

  const courseGroups = await getMaterials();

  return (
    <div className="min-h-screen bg-stone-950 flex">
      {/* Sidebar (same as dashboard, ideally we'd extract it to a layout, but keeping it inline for speed) */}
      <aside className="w-60 h-screen fixed top-0 left-0 bg-stone-900 border-r border-white/[0.06] flex flex-col p-6 z-50 max-md:hidden">
        <div className="flex items-center gap-3 px-3 mb-8">
          <div className="w-7 h-7 rounded-md bg-accent-600 flex items-center justify-center text-sm font-bold text-white">
            C
          </div>
          <span className="text-base font-semibold tracking-tight">Spear</span>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <a
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-all"
          >
            <span className="w-5 text-center">📋</span>
            Todos
          </a>
          <a
            href="/materials"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-accent-500/10 text-accent-400"
          >
            <span className="w-5 text-center">📚</span>
            Materials
          </a>
          <a
            href="/email"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-all"
          >
            <span className="w-5 text-center">✉️</span>
            Email
          </a>
        </nav>

        <div className="border-t border-white/[0.06] pt-4">
          <a
            href="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-all"
          >
            <span className="w-5 text-center">⚙️</span>
            Settings
          </a>
        </div>
      </aside>

      <main className="ml-60 max-md:ml-0 flex-1 min-h-screen p-8 max-md:p-4">
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Course Materials</h1>
            <p className="text-sm text-stone-400">
              Files and links from your enrolled Moodle courses.
            </p>
          </div>
        </div>

        {courseGroups.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4 opacity-30">📚</div>
            <h2 className="text-lg font-semibold mb-2">No courses found</h2>
            <p className="text-sm text-stone-400 max-w-xs mx-auto mb-6">
              Go to the Dashboard and click &quot;Sync Moodle&quot; to fetch your courses.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {courseGroups.map((group) => (
              <div
                key={group.courseId}
                className="bg-stone-900 border border-white/[0.06] rounded-xl p-5 shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-stone-200">{group.courseName}</h3>
                </div>
                
                {group.summary && (
                  <CourseSummaryClient courseId={group.courseId} rawSummary={group.summary} />
                )}

                {group.materials.length === 0 ? (
                  <p className="text-sm text-stone-500 italic">No materials found for this course.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {group.materials.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 text-sm">
                        <span className="text-stone-400">{m.type === 'url' ? '🔗' : '📄'}</span>
                        <a
                          href={m.url || '#'}
                          className="text-accent-400 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
