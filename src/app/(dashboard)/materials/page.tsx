import { getMaterials } from './actions';
import { isVaultInitialized } from '@/lib/vault';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';
import { CourseSummaryClient } from './CourseSummaryClient';

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
            icon="📚"
            title="No courses found"
            description='Go to the Dashboard and click "Sync Moodle" to fetch your courses.'
          />
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
    </>
  );
}
