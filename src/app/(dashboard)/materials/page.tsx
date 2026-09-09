import { getMaterials } from './actions';
import { isVaultInitialized } from '@/lib/vault';
import { redirect } from 'next/navigation';
import { BookOpen, ExternalLink, FileText } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { CourseSummaryClient } from './CourseSummaryClient';

export const dynamic = 'force-dynamic';

export default async function MaterialsPage() {
  const vaultExists = await isVaultInitialized();
  if (!vaultExists) {
    redirect('/setup');
  }

  const courseGroups = await getMaterials();

  return (
    <>
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Course Materials</h1>
            <p className="text-sm text-stone-400">
              Files and links from your enrolled Moodle courses.
            </p>
          </div>
        </div>

        {courseGroups.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12 stroke-[1.5]" />}
            title="No courses found"
            description='Go to the Dashboard and click "Sync Moodle" to fetch your courses.'
          />
        ) : (
          <div className="grid gap-4 sm:gap-6 min-w-0 max-w-full">
            {courseGroups.map((group) => (
              <div
                key={group.courseId}
                className="bg-stone-900/95 border border-white/[0.08] rounded-xl p-4 sm:p-5 shadow-sm min-w-0 max-w-full overflow-hidden"
              >
                <div className="flex justify-between items-start mb-3 sm:mb-4 min-w-0">
                  <h3 className="font-semibold text-stone-200 text-sm sm:text-base break-words">{group.courseName}</h3>
                </div>
                
                {group.summary && (
                  <CourseSummaryClient courseId={group.courseId} rawSummary={group.summary} />
                )}

                {group.materials.length === 0 ? (
                  <p className="text-xs sm:text-sm text-stone-500 italic">No materials found for this course.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5 min-w-0">
                    {group.materials.map((m) => (
                      <li key={`${m.id}-${m.filename || 'module'}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 text-sm p-2 rounded-lg hover:bg-white/[0.02] min-w-0">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <span className="text-stone-400 mt-0.5 shrink-0">{m.type === 'url' ? <ExternalLink className="w-4 h-4" /> : <FileText className="w-4 h-4" />}</span>
                          <div className="min-w-0 flex-1">
                            <a
                              href={m.url || '#'}
                              className="text-accent-400 hover:underline text-xs sm:text-sm break-all font-medium"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {m.filename || m.name}
                            </a>
                            <p className="text-[11px] text-stone-500 truncate mt-0.5">
                              {[m.sectionName, m.filename ? m.name : null].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        {m.fileStatus && (
                          <span className={`text-[11px] self-start sm:self-center shrink-0 px-2 py-0.5 rounded ${m.fileStatus === 'downloaded' ? 'text-success bg-success/10' : m.fileStatus === 'failed' ? 'text-danger bg-danger/10' : 'text-stone-500 bg-stone-800'}`} title={m.fileError || undefined}>
                            {m.fileStatus === 'downloaded' ? 'Saved locally' : m.fileStatus === 'skipped' ? 'Skipped' : 'Unavailable'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
    </>
  );
}
