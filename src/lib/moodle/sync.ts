/**
 * Moodle sync engine — orchestrates fetching data from Moodle and writing to SQLite.
 * Creates todos automatically from assignments with future due dates.
 */

import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import { SessionManager } from '@/lib/moodle/session';
import type { MoodleSession } from '@/lib/moodle/session';
import { fetchCourses, fetchAssignments } from '@/lib/moodle/api';

export interface SyncResult {
  success: boolean;
  coursesCount: number;
  assignmentsCount: number;
  todosCreated: number;
  error?: string;
  durationMs: number;
}

/**
 * Converts a Moodle Unix timestamp (seconds) to an ISO 8601 string.
 * Returns null for 0 or falsy values (Moodle uses 0 for "no date").
 */
function toIsoDate(timestamp: number | undefined | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Computes a SHA-256 content hash for change detection.
 */
function computeContentHash(name: string, intro: string, duedate: number): string {
  return crypto
    .createHash('sha256')
    .update(name || '')
    .update(intro || '')
    .update(String(duedate || 0))
    .digest('hex');
}

/**
 * Syncs courses from Moodle into the local database.
 */
async function syncCourses(
  sm: SessionManager,
  session: MoodleSession,
): Promise<number> {
  const db = getDb();
  const moodleCourses = await fetchCourses(sm, session);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO courses (moodle_id, shortname, fullname, category, visible, last_synced_at, created_at, updated_at)
    VALUES (@moodle_id, @shortname, @fullname, @category, @visible, @last_synced_at, @created_at, @updated_at)
    ON CONFLICT(moodle_id) DO UPDATE SET
      shortname = excluded.shortname,
      fullname = excluded.fullname,
      category = excluded.category,
      visible = excluded.visible,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `);

  for (const c of moodleCourses) {
    stmt.run({
      moodle_id: c.id,
      shortname: c.shortname,
      fullname: c.fullname,
      category: c.categoryname || null,
      visible: c.visible,
      last_synced_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return moodleCourses.length;
}

/**
 * Syncs assignments from Moodle into the local database.
 * Creates todos for new assignments with future due dates.
 */
async function syncAssignments(
  sm: SessionManager,
  session: MoodleSession,
): Promise<{ assignmentsCount: number; todosCreated: number }> {
  const db = getDb();

  // Get all local course moodle_ids
  const courses = db.prepare('SELECT id, moodle_id FROM courses').all() as {
    id: number;
    moodle_id: number;
  }[];

  const courseMap = new Map(courses.map((c) => [c.moodle_id, c.id]));
  const courseIds = courses.map((c) => c.moodle_id);

  if (courseIds.length === 0) return { assignmentsCount: 0, todosCreated: 0 };

  const response = await fetchAssignments(sm, session, courseIds);
  const now = new Date().toISOString();

  const insertAssignment = db.prepare(`
    INSERT INTO assignments (
      moodle_id, course_id, name, intro, due_date, allow_submissions_from,
      grade_max, content_hash, last_synced_at, created_at, updated_at
    ) VALUES (
      @moodle_id, @course_id, @name, @intro, @due_date, @allow_submissions_from,
      @grade_max, @content_hash, @last_synced_at, @created_at, @updated_at
    ) ON CONFLICT(moodle_id) DO UPDATE SET
      course_id = excluded.course_id,
      name = excluded.name,
      intro = excluded.intro,
      due_date = excluded.due_date,
      allow_submissions_from = excluded.allow_submissions_from,
      grade_max = excluded.grade_max,
      content_hash = excluded.content_hash,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `);

  const checkExisting = db.prepare('SELECT id FROM assignments WHERE moodle_id = ?');

  const checkTodoExists = db.prepare(
    "SELECT 1 FROM todos WHERE source_type = 'assignment' AND source_id = ?",
  );

  const insertTodo = db.prepare(`
    INSERT INTO todos (title, description, source_type, source_id, due_date, status, priority, created_at, updated_at)
    VALUES (@title, @description, 'assignment', @source_id, @due_date, 'pending', 0, @created_at, @updated_at)
  `);

  let assignmentsCount = 0;
  let todosCreated = 0;

  for (const courseData of response.courses) {
    const localCourseId = courseMap.get(courseData.id);
    if (!localCourseId) continue;

    for (const a of courseData.assignments) {
      assignmentsCount++;

      const isNew = !checkExisting.get(a.id);
      const contentHash = computeContentHash(a.name, a.intro, a.duedate);
      const dueDateIso = toIsoDate(a.duedate);

      const result = insertAssignment.run({
        moodle_id: a.id,
        course_id: localCourseId,
        name: a.name,
        intro: a.intro || '',
        due_date: dueDateIso,
        allow_submissions_from: toIsoDate(a.allowsubmissionsfromdate),
        grade_max: a.grade || 0,
        content_hash: contentHash,
        last_synced_at: now,
        created_at: now,
        updated_at: now,
      });

      // Create a todo for new assignments with future due dates
      const localAssignmentId = isNew
        ? Number(result.lastInsertRowid)
        : (checkExisting.get(a.id) as { id: number }).id;

      if (isNew && a.duedate && a.duedate * 1000 > Date.now()) {
        if (!checkTodoExists.get(localAssignmentId)) {
          insertTodo.run({
            title: a.name,
            description: a.intro ? a.intro.replace(/<[^>]*>/g, '').slice(0, 500) : null,
            source_id: localAssignmentId,
            due_date: dueDateIso,
            created_at: now,
            updated_at: now,
          });
          todosCreated++;
        }
      }
    }
  }

  return { assignmentsCount, todosCreated };
}

/**
 * Main sync entry point — syncs courses and assignments from Moodle.
 * Records the sync attempt in sync_log.
 *
 * @param username UES Moodle username
 * @param password UES Moodle password
 */
export async function syncMoodle(
  username: string,
  password: string,
): Promise<SyncResult> {
  const startTime = Date.now();
  const db = getDb();

  const insertLog = db.prepare(`
    INSERT INTO sync_log (sync_type, status, items_synced, started_at)
    VALUES ('moodle', 'partial', 0, datetime('now'))
  `);
  const logResult = insertLog.run();
  const logId = logResult.lastInsertRowid;

  let coursesCount = 0;
  let assignmentsCount = 0;
  let todosCreated = 0;
  let errorMsg: string | undefined;
  let success = false;

  try {
    const sm = new SessionManager();
    const session = await sm.ensureSession(username, password);

    coursesCount = await syncCourses(sm, session);

    const assignResult = await syncAssignments(sm, session);
    assignmentsCount = assignResult.assignmentsCount;
    todosCreated = assignResult.todosCreated;

    success = true;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
    success = false;
  }

  // Update sync log
  db.prepare(`
    UPDATE sync_log
    SET status = ?, items_synced = ?, error_message = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(
    success ? 'success' : 'failed',
    coursesCount + assignmentsCount,
    errorMsg || null,
    logId,
  );

  return {
    success,
    coursesCount,
    assignmentsCount,
    todosCreated,
    error: errorMsg,
    durationMs: Date.now() - startTime,
  };
}
