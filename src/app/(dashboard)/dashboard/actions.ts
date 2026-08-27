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
        END as courseName,
        (SELECT status FROM agent_runs WHERE todo_id = t.id ORDER BY id DESC LIMIT 1) as draftStatus
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

/**
 * Starts a background draft generation for a given todo.
 */
export async function startDraftGeneration(todoId: number, force: boolean = false) {
  const { getDb } = await import('@/lib/db');
  const db = getDb();
  
  if (!force) {
    const existing = db.prepare('SELECT id, status FROM agent_runs WHERE todo_id = ? ORDER BY id DESC LIMIT 1').get(todoId) as any;
    if (existing && (existing.status === 'running' || existing.status === 'completed')) {
      return { success: true, runId: existing.id };
    }
  }
  
  const result = db.prepare(`
    INSERT INTO agent_runs (todo_id, status, model_used, created_at)
    VALUES (?, 'running', 'gemini-3.1-pro-high', datetime('now'))
  `).run(todoId);
  const runId = Number(result.lastInsertRowid);
  
  // kick off async process (local node process will keep running it)
  generateDraftBackground(todoId, runId).catch(console.error);
  
  return { success: true, runId };
}

async function generateDraftBackground(todoId: number, runId: number) {
  const { getDb } = await import('@/lib/db');
  const db = getDb();
  const startTime = Date.now();
  try {
    const { buildContextPack } = await import('@/lib/agent/runner');
    const { generateText } = await import('@/lib/llm');
    const context = await buildContextPack(todoId);
    
    if (!context) throw new Error('Context not found');
    
    const cleanIntro = context.assignmentIntro.replace(/<[^>]*>?/gm, '');

    const prompt = `
You are an expert academic assistant helping a university student at the Universidad de El Salvador (UES) complete their assignment.

Your task is to FULLY RESOLVE AND COMPLETE the assignment below — produce a final, submission-ready answer that the student can review and submit.
Do NOT just suggest what to do, outline steps, or say "you should consider...". Write the actual complete answer, content, analysis, or document that the assignment requires.

Course: ${context.courseName}
Assignment Name: ${context.assignmentName}

Assignment Instructions:
${cleanIntro}

Guidelines:
- Read all relevant files in the materials directory for context and source material.
- Write the complete assignment response as if you are the student submitting it.
- Use clear, formal academic Spanish (this is a Spanish-language university).
- Structure the output properly for the type of assignment (essay, report, analysis, etc.).
- Be thorough and detailed — this is a real graded submission.
- If specific data, dates, or information is missing from the materials, make reasonable academic assumptions and note them briefly.

The directory ${context.materialsDirectory} contains reference files from Moodle for this course. Use them as source material.
`;


    const draft = await generateText(prompt, {
      model: 'gemini-3.1-pro-high',
      timeout: 300000,
      additionalDirectories: [context.materialsDirectory],
    });
    
    db.prepare(`
      UPDATE agent_runs 
      SET status = 'completed', draft = ?, duration_ms = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(draft, Date.now() - startTime, runId);
    
  } catch (error: any) {
    db.prepare(`
      UPDATE agent_runs 
      SET status = 'failed', error_message = ?, duration_ms = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(error.message, Date.now() - startTime, runId);
  }
}

/**
 * Gets the draft status for a given todo.
 */
export async function getDraftStatus(todoId: number) {
  const { getDb } = await import('@/lib/db');
  const db = getDb();
  const run = db.prepare('SELECT id, status, draft, error_message FROM agent_runs WHERE todo_id = ? ORDER BY id DESC LIMIT 1').get(todoId) as any;
  return run || null;
}
