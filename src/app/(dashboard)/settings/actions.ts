'use server';

import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';
import { unlockVault, updateCredentials, type VaultCredentials } from '@/lib/vault';

export async function loadSettings(): Promise<AppSettings> {
  return getSettings();
}

import { revalidatePath } from 'next/cache';

export async function updateSettings(settings: AppSettings): Promise<{ success: boolean; error?: string }> {
  try {
    saveSettings(settings);
    revalidatePath('/');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save settings' };
  }
}

export async function unlockCredentials(masterPassword: string): Promise<{ success: boolean; credentials?: { uesUsername: string; hasUesPassword: boolean; hasGmailAppPassword: boolean }; error?: string }> {
  try {
    const creds = await unlockVault(masterPassword);
    return {
      success: true,
      credentials: {
        uesUsername: creds.uesUsername,
        hasUesPassword: !!creds.uesPassword,
        hasGmailAppPassword: !!creds.gmailAppPassword,
      },
    };
  } catch {
    return { success: false, error: 'Incorrect master password.' };
  }
}

export async function saveCredentials(
  masterPassword: string,
  updates: Partial<VaultCredentials>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateCredentials(masterPassword, updates);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update credentials.' };
  }
}
