'use server';

import { getSettings, saveSettings, type AppSettings } from '@/lib/settings';

export async function loadSettings(): Promise<AppSettings> {
  return getSettings();
}

export async function updateSettings(settings: AppSettings): Promise<{ success: boolean; error?: string }> {
  try {
    saveSettings(settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save settings' };
  }
}
