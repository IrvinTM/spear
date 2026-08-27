import { getAssignmentsWithDrafts } from './actions';
import { AssignmentsClient } from './client';
import { isVaultInitialized } from '@/lib/vault';
import { redirect } from 'next/navigation';

export default async function AssignmentsPage() {
  const vaultExists = await isVaultInitialized();
  if (!vaultExists) redirect('/setup');

  const assignments = await getAssignmentsWithDrafts();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Assignments</h1>
        <p className="text-sm text-stone-400">
          All your assignments with AI-generated drafts, ready to review and submit.
        </p>
      </div>
      <AssignmentsClient assignments={assignments} />
    </>
  );
}
