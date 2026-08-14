import { redirect } from 'next/navigation';
import { isVaultInitialized } from '@/lib/vault';
import { getSyncStatus, getTodos } from './dashboard/actions';
import { DashboardClient } from './dashboard/client';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const vaultExists = await isVaultInitialized();

  if (!vaultExists) {
    redirect('/setup');
  }

  const settings = getSettings();
  const [syncStatus, todos] = await Promise.all([
    getSyncStatus(),
    getTodos(),
  ]);

  return <DashboardClient 
    initialSyncStatus={syncStatus} 
    initialTodos={todos}
    activeCharacter={settings.character} 
    activeAnimation={settings.animation}
    activeTalkingAnimation={settings.talkingAnimation}
  />;
}
