import { getEmails } from './actions';
import { isVaultInitialized } from '@/lib/vault';
import { redirect } from 'next/navigation';
import { EmailClient } from './client';

export const dynamic = 'force-dynamic';

export default async function EmailPage() {
  const vaultExists = await isVaultInitialized();
  if (!vaultExists) {
    redirect('/setup');
  }

  const emails = await getEmails();

  return <EmailClient initialEmails={emails} />;
}
