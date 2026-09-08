import { cookies, headers } from 'next/headers';
import { randomBytes } from 'node:crypto';
import type { VaultCredentials } from '@/lib/vault';

// In-memory cache for decrypted credentials. 
// Use globalThis to persist across Next.js hot-reloads and bundle boundaries in development.
const globalAny = global as any;
if (!globalAny.sessionCache) {
  globalAny.sessionCache = new Map<string, { creds: VaultCredentials, expiresAt: number }>();
}
const sessionCache = globalAny.sessionCache;
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function createSession(creds: VaultCredentials) {
  const token = randomBytes(32).toString('hex');
  sessionCache.set(token, {
    creds,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  
  let isHttps = false;
  try {
    const reqHeaders = await headers();
    isHttps = reqHeaders.get('x-forwarded-proto') === 'https' || reqHeaders.get('referer')?.startsWith('https://') === true;
  } catch {
    // headers() might not be available in some contexts
  }
  const isSecure = process.env.COOKIE_SECURE === 'true' || isHttps;

  const cookieStore = await cookies();
  cookieStore.set('spear_session', token, {
    httpOnly: true,
    secure: isSecure,
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

