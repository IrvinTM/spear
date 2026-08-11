import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import argon2 from 'argon2';

/**
 * The credentials stored in the vault.
 */
export interface VaultCredentials {
  uesUsername: string;
  uesPassword: string;
  gmailAppPassword?: string;
}

/**
 * The structure of the encrypted vault file on disk.
 */
interface VaultFormat {
  salt: string;   // hex
  iv: string;     // hex
  tag: string;    // hex
  data: string;   // hex (encrypted JSON)
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

/**
 * Returns the agent home directory.
 * Configurable via UES_AGENT_HOME env var, defaults to ~/.ues-agent
 */
export function getAgentHome(): string {
  const customHome = process.env.UES_AGENT_HOME;
  if (customHome) {
    return path.resolve(customHome);
  }
  return path.join(os.homedir(), '.ues-agent');
}

/**
 * Returns the path to the vault file.
 */
export function getVaultPath(): string {
  return path.join(getAgentHome(), 'vault.enc');
}

/**
 * Generates an encryption key from a master password and salt using Argon2id.
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const keyBuffer = await argon2.hash(password, {
    type: argon2.argon2id,
    salt,
    raw: true,
    hashLength: KEY_LENGTH,
  });
  return keyBuffer as Buffer;
}

/**
 * Checks if the vault file exists.
 */
export async function isVaultInitialized(): Promise<boolean> {
  try {
    const vaultPath = getVaultPath();
    await fs.access(vaultPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initializes the vault with the master password and initial credentials.
 * Creates the agent home directory if it doesn't exist.
 * @param masterPassword The master password to secure the vault
 * @param credentials The initial credentials to store
 */
export async function initializeVault(
  masterPassword: string,
  credentials: VaultCredentials,
): Promise<void> {
  const vaultPath = getVaultPath();
  const agentHome = getAgentHome();

  await fs.mkdir(agentHome, { recursive: true });

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(masterPassword, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const jsonData = JSON.stringify(credentials);

  let encrypted = cipher.update(jsonData, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  const vaultData: VaultFormat = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag,
    data: encrypted,
  };

  await fs.writeFile(vaultPath, JSON.stringify(vaultData, null, 2), 'utf8');
}

/**
 * Unlocks the vault using the master password and returns the credentials.
 * @param masterPassword The master password to decrypt the vault
 * @returns The decrypted credentials
 * @throws If the password is wrong or the file is corrupted
 */
export async function unlockVault(
  masterPassword: string,
): Promise<VaultCredentials> {
  const vaultPath = getVaultPath();
  const fileData = await fs.readFile(vaultPath, 'utf8');
  const vaultData: VaultFormat = JSON.parse(fileData);

  const salt = Buffer.from(vaultData.salt, 'hex');
  const iv = Buffer.from(vaultData.iv, 'hex');
  const tag = Buffer.from(vaultData.tag, 'hex');
  const key = await deriveKey(masterPassword, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(vaultData.data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted) as VaultCredentials;
}

/**
 * Validates the master password without returning credentials.
 * @param masterPassword The master password to validate
 * @returns true if valid, false otherwise
 */
export async function validateMasterPassword(
  masterPassword: string,
): Promise<boolean> {
  try {
    await unlockVault(masterPassword);
    return true;
  } catch {
    return false;
  }
}

/**
 * Updates specific credentials in the vault.
 * Re-encrypts with a new salt and IV for forward secrecy.
 * @param masterPassword The master password to unlock and re-lock the vault
 * @param credentials Partial credentials to merge
 */
export async function updateCredentials(
  masterPassword: string,
  credentials: Partial<VaultCredentials>,
): Promise<void> {
  const currentCredentials = await unlockVault(masterPassword);
  const updatedCredentials: VaultCredentials = {
    ...currentCredentials,
    ...credentials,
  };

  const vaultPath = getVaultPath();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(masterPassword, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const jsonData = JSON.stringify(updatedCredentials);

  let encrypted = cipher.update(jsonData, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  const vaultData: VaultFormat = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag,
    data: encrypted,
  };

  await fs.writeFile(vaultPath, JSON.stringify(vaultData, null, 2), 'utf8');
}
