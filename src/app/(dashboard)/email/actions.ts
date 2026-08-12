'use server';

import { unlockVault } from '@/lib/vault';
import { getSessionCredentials } from '@/lib/auth-session';
import { syncEmails } from '@/lib/email/sync';

import type { EmailItem } from '@/lib/types';

export async function getEmails(): Promise<EmailItem[]> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();
    
    return db.prepare(`
      SELECT
        id,
        message_id as messageId,
        from_address as fromAddress,
        from_name as fromName,
        subject,
        body_text as bodyText,
        summary,
        has_deadline_mention as hasDeadline,
        is_read as isRead,
        received_at as receivedAt
      FROM emails
      ORDER BY received_at DESC
      LIMIT 100
    `).all() as EmailItem[];
  } catch {
    return [];
  }
}

export async function triggerEmailSync(
  ): Promise<{ success: boolean; emailsFetched?: number; todosCreated?: number; error?: string; needsAuth?: boolean }> {
  try {
    const creds = await getSessionCredentials();
    if (!creds) {
      return { success: false, needsAuth: true, error: 'Session expired or not unlocked.' };
    }
    
    if (!creds.gmailAppPassword) {
      return { success: false, error: 'Gmail App Password not set in vault.' };
    }
    
    // For gmail, the username is usually the UES username + domain or standard ues email
    // UES domains are usually @ues.edu.sv. We will construct it if creds.uesUsername is just the ID.
    let emailUser = creds.uesUsername;
    if (!emailUser.includes('@')) {
      emailUser = `${emailUser}@ues.edu.sv`;
    }

    const result = await syncEmails(emailUser, creds.gmailAppPassword);
    
    return {
      success: result.success,
      emailsFetched: result.emailsFetched,
      todosCreated: result.todosCreated,
      error: result.error,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Sync failed' };
  }
}
