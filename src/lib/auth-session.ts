import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import type { VaultCredentials } from '@/lib/vault';

// In-memory cache for decrypted credentials. 
// Will be lost on server restart, requiring the user to unlock the vault again.
const sessionCache = new Map<string, { creds: VaultCredentials, expiresAt: number }>();
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function createSession(creds: VaultCredentials) {
  const token = randomBytes(32).toString('hex');
  sessionCache.set(token, {
    creds,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  
  const cookieStore = await cookies();
  cookieStore.set('spear_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function getSessionCredentials(): Promise<VaultCredentials | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('spear_session')?.value;
  if (!token) return null;
  
  const session = sessionCache.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessionCache.delete(token);
    return null;
  }
  
  // Extend session
  session.expiresAt = Date.now() + SESSION_DURATION_MS;
  return session.creds;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('spear_session')?.value;
  if (token) {
    sessionCache.delete(token);
    cookieStore.delete('spear_session');
  }
}
