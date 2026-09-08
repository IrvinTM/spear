'use server';

import {
  isVaultInitialized,
  initializeVault,
  type VaultCredentials,
} from '@/lib/vault';
import { isAgyAvailable } from '@/lib/llm';
import { initSchema } from '@/lib/db';

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Creates the vault with the master password and credentials.
 * Also initializes the database schema.
 */
export async function setupVault(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const masterPassword = formData.get('masterPassword') as string;
    const credentials = {
      uesUsername: formData.get('uesUsername') as string,
      uesPassword: formData.get('uesPassword') as string,
      gmailAppPassword: (formData.get('gmailAppPassword') as string) || undefined,
    };

    if (masterPassword.length < 8) {
      return { success: false, error: 'Master password must be at least 8 characters.' };
    }

    if (!credentials.uesUsername || !credentials.uesPassword) {
      return { success: false, error: 'UES username and password are required.' };
    }

    await initializeVault(masterPassword, credentials);

    // Initialize database schema on first setup
    initSchema();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during setup.';
    return { success: false, error: message };
  }
}

/**
 * Checks if agy CLI is available and returns model info.
 */
export async function checkLlmStatus(): Promise<{
  available: boolean;
  path?: string;
}> {
  const available = await isAgyAvailable();
  return { available };
}
