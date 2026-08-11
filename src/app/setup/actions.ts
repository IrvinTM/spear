'use server';

import {
  isVaultInitialized,
  initializeVault,
  validateMasterPassword,
  type VaultCredentials,
} from '@/lib/vault';
import { isAgyAvailable } from '@/lib/llm';
import { initSchema } from '@/lib/db';

export interface SetupState {
  vaultExists: boolean;
  agyAvailable: boolean;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Checks the current setup state: does a vault exist, is agy available?
 */
export async function getSetupState(): Promise<SetupState> {
  const [vaultExists, agyAvailable] = await Promise.all([
    isVaultInitialized(),
    isAgyAvailable(),
  ]);

  return { vaultExists, agyAvailable };
}

/**
 * Creates the vault with the master password and credentials.
 * Also initializes the database schema.
 */
export async function setupVault(
  masterPassword: string,
  credentials: VaultCredentials,
): Promise<ActionResult> {
  try {
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
 * Validates the master password against an existing vault.
 */
export async function unlockExistingVault(
  masterPassword: string,
): Promise<ActionResult> {
  try {
    const valid = await validateMasterPassword(masterPassword);
    if (!valid) {
      return { success: false, error: 'Incorrect master password.' };
    }

    // Ensure schema is up to date on unlock too
    initSchema();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error unlocking vault.';
    return { success: false, error: message };
  }
}

/**
 * Validates UES credentials by attempting a Moodle login.
 * TODO: Implement actual Moodle login test in build step 2.
 */
export async function testMoodleLogin(
  username: string,
  password: string,
): Promise<ActionResult> {
  // Placeholder: will be replaced with actual HTTP login flow
  if (!username || !password) {
    return { success: false, error: 'Username and password are required.' };
  }
  return { success: true };
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
