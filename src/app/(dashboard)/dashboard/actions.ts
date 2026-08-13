'use server';

import { unlockVault } from '@/lib/vault';

import { createSession, getSessionCredentials } from '@/lib/auth-session';

/**
 * Validates the master password, unlocks the vault, and creates a secure server session.
 */
export async function createSessionAction(formData: FormData) {
  try {
    const masterPassword = formData.get('masterPassword') as string;
    const creds = await unlockVault(masterPassword);
    await createSession(creds);
    return { success: true as const };
  } catch {
    return { success: false as const, error: 'Failed to unlock vault. Incorrect password?' };
  }
}

import type { SyncStatus, TodoItem } from '@/lib/types';

/**
 * Gets the current sync status from the database.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    // Get last moodle sync
    const lastSync = db.prepare(
      `SELECT * FROM sync_log WHERE sync_type = 'moodle' ORDER BY started_at DESC LIMIT 1`
    ).get() as { status: string; started_at: string; error_message: string | null } | undefined;

    const coursesCount = (db.prepare('SELECT COUNT(*) as count FROM courses').get() as { count: number }).count;
    const assignmentsCount = (db.prepare('SELECT COUNT(*) as count FROM assignments').get() as { count: number }).count;
    const todosCount = (db.prepare(`SELECT COUNT(*) as count FROM todos WHERE status != 'done'`).get() as { count: number }).count;

    return {
      lastSync: lastSync?.started_at ?? null,
      status: (lastSync?.status as SyncStatus['status']) ?? 'never',
      coursesCount,
      assignmentsCount,
      todosCount,
      error: lastSync?.error_message ?? undefined,
    };
  } catch {
    return {
      lastSync: null,
      status: 'never',
      coursesCount: 0,
      assignmentsCount: 0,
      todosCount: 0,
    };
  }
}



/**
 * Gets all active todos (pending and in_progress), sorted by due date.
 */
export async function getTodos(): Promise<TodoItem[]> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    const rows = db.prepare(`
      SELECT
        t.id, t.title, t.description, t.source_type as sourceType,
        t.due_date as dueDate, t.status,
        CASE
          WHEN t.source_type = 'assignment' THEN (
            SELECT c.fullname FROM assignments a
            JOIN courses c ON c.id = a.course_id
            WHERE a.id = t.source_id
          )
          ELSE NULL
        END as courseName
      FROM todos t
      WHERE t.status != 'done'
      ORDER BY
        CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
        t.due_date ASC,
        t.priority DESC
    `).all() as TodoItem[];

    return rows;
  } catch {
    return [];
  }
}

/**
 * Updates a todo's status.
 */
export async function updateTodoStatus(
  todoId: number,
  status: 'pending' | 'in_progress' | 'done',
): Promise<{ success: boolean }> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    db.prepare(
      `UPDATE todos SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(status, todoId);

    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Triggers a Moodle sync. Returns the sync result.
 */
export async function triggerMoodleSync(
  ): Promise<{
  success: boolean;
  coursesCount?: number;
  assignmentsCount?: number;
  todosCreated?: number;
  error?: string;
  needsAuth?: boolean;
}> {
  try {
    const creds = await getSessionCredentials();
    if (!creds) {
      return { success: false, needsAuth: true, error: 'Session expired or not unlocked.' };
    }
    
    const { syncMoodle } = await import('@/lib/moodle/sync');
    const { initSchema } = await import('@/lib/db');
    initSchema();
    const result = await syncMoodle(creds.uesUsername, creds.uesPassword);

    return {
      success: result.success,
      coursesCount: result.coursesCount,
      assignmentsCount: result.assignmentsCount,
      todosCreated: result.todosCreated,
      error: result.error,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Sync failed.',
    };
  }
}
