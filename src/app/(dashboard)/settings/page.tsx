import { getSettings } from '@/lib/settings';
import { isVaultInitialized } from '@/lib/vault';
import { redirect } from 'next/navigation';
import { SettingsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const vaultExists = await isVaultInitialized();
  if (!vaultExists) redirect('/setup');

  const settings = getSettings();

  return <SettingsClient initialSettings={settings} />;
}
