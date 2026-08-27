/**
 * Moodle sync engine — orchestrates fetching data from Moodle and writing to SQLite.
 * Creates todos automatically from assignments with future due dates.
 */

import crypto from 'node:crypto';
import { getDb } from '@/lib/db';
import { SessionManager } from '@/lib/moodle/session';
import type { MoodleSession } from '@/lib/moodle/session';
import { fetchCourses, fetchAssignments } from '@/lib/moodle/api';
import type { ExtractedMaterial, MoodleModuleContent } from '@/lib/moodle/api';
import { buildMaterialPath, getMaterialMaxFileBytes, writeMaterialFile, removeMaterialFile } from '@/lib/materials/storage';
import { logActivity } from '@/lib/activity-log';
import { capturePreSyncState, computeDiff, saveSyncSnapshot } from '@/lib/sync-diff';

export interface SyncResult {
  success: boolean;
  coursesCount: number;
  assignmentsCount: number;
  materialsCount: number;
  filesDownloaded: number;
  filesSkipped: number;
  filesFailed: number;
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

function isSupportedMaterial(content: MoodleModuleContent): boolean {
  const mime = (content.mimetype || '').toLowerCase();
  const filename = content.filename.toLowerCase();
  return mime.startsWith('image/') || mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    /\.(pdf|txt|md|csv|html?|docx?|pptx?|xlsx?)$/.test(filename);
}

function filenameForDownload(content: MoodleModuleContent, mime: string | null, moduleId: number): string {
  const filename = content.filename || `module-${moduleId}`;
  if (content.type !== 'module_download' || !mime || mime === 'text/html') return filename;
  const extension = mime === 'application/pdf' ? '.pdf'
    : mime.startsWith('image/') ? `.${mime.slice('image/'.length).replace('jpeg', 'jpg')}`
    : null;
  return extension && /\.html?$/i.test(filename) ? filename.replace(/\.html?$/i, extension) : filename;
}

async function getFallbackModuleContents(
  _sm: SessionManager,
  _session: MoodleSession,
  material: ExtractedMaterial,
): Promise<MoodleModuleContent[]> {
  // Moodle's HTML fallback does not expose file metadata. Saving the rendered
  // module page still gives the local agent readable context and follows the
  // same authenticated download path as regular files.
  if (!material.url || !['resource', 'page', 'folder'].includes(material.type)) return [];
  return [{
    type: material.type === 'page' ? 'page_snapshot' : 'module_download',
    filename: `${material.name || `module-${material.id}`}.html`,
    fileurl: material.url,
    filesize: 0,
    mimetype: 'text/html',
  }];
}

/**
 * Parses a downloaded Moodle resource HTML page to find the actual file URL
 * (pluginfile.php link). Returns null if no link is found.
 */
function extractPluginfileUrl(html: string, baseUrl: string): string | null {
  // Match pluginfile.php URLs for mod_resource content
  const pattern = /https?:\/\/[^"'\s]*pluginfile\.php\/\d+\/mod_resource\/content\/\d+\/[^"'\s]+/g;
  const matches = html.match(pattern);
  if (!matches || matches.length === 0) return null;
  // Deduplicate and return the first unique URL
  const unique = [...new Set(matches.map(u => u.replace(/&amp;/g, '&')))];
  return unique[0] || null;
}

type MaterialFileStatements = {
  findMaterialFile: { get: (materialId: number, sourceUrl: string) => { id: number; local_path: string | null; content_hash: string | null } | undefined };
  insertMaterialFile: { run: (params: Record<string, unknown>) => unknown };
  updateMaterialFile: { run: (params: Record<string, unknown>) => unknown };
  findMaterialFileMime: { get: (id: number) => { mime_type: string | null } | undefined };
};

async function syncMaterialFile({
  sm, session, materialId, courseId, sectionPosition, moduleId, content, now,
  findMaterialFile, insertMaterialFile, updateMaterialFile, findMaterialFileMime,
}: {
  sm: SessionManager;
  session: MoodleSession;
  materialId: number;
  courseId: number;
  sectionPosition: number;
  moduleId: number;
  content: MoodleModuleContent;
  now: string;
} & MaterialFileStatements): Promise<'downloaded' | 'skipped' | 'failed' | 'unchanged'> {
  const existing = findMaterialFile.get(materialId, content.fileurl);
  // Re-process if the existing file is an HTML wrapper (text/html for a resource type)
  const existingMime = existing ? (findMaterialFileMime.get(existing.id) as { mime_type: string | null } | undefined)?.mime_type : null;
  const isHtmlWrapper = existingMime === 'text/html' && content.type !== 'page_snapshot';
  if (existing?.local_path && existing.content_hash && !isHtmlWrapper) return 'unchanged';

  const base = {
    material_id: materialId,
    source_url: content.fileurl,
    original_filename: content.filename || `module-${moduleId}`,
    mime_type: content.mimetype || null,
    expected_size: content.filesize || null,
    updated_at: now,
  };
  const save = (params: Record<string, unknown>) => {
    if (existing) updateMaterialFile.run({ ...base, ...params, id: existing.id });
    else insertMaterialFile.run({ ...base, ...params, created_at: now });
  };

  if (!isSupportedMaterial(content)) {
    save({ local_path: null, file_size: null, content_hash: null, status: 'skipped', error_message: 'Unsupported file type', downloaded_at: null });
    return 'skipped';
  }
  const maxBytes = getMaterialMaxFileBytes();
  if (content.filesize > maxBytes) {
    save({ local_path: null, file_size: null, content_hash: null, status: 'skipped', error_message: `File exceeds configured limit of ${maxBytes} bytes`, downloaded_at: null });
    return 'skipped';
  }

  try {
    const download = await sm.download(session, content.fileurl, maxBytes);
    const mime = download.contentType?.split(';', 1)[0] || content.mimetype || null;

    // If we got an HTML page for a resource/folder type, try to extract the actual file URL
    if (mime === 'text/html' && ['module_download', 'page_snapshot'].includes(content.type)) {
      const html = download.bytes.toString('utf-8');
      const realUrl = extractPluginfileUrl(html, sm.getBaseUrl());
      if (realUrl) {
        const realDownload = await sm.download(session, realUrl, maxBytes);
        const realMime = realDownload.contentType?.split(';', 1)[0] || null;
        if (realMime && realMime !== 'text/html') {
          // Successfully got the actual file — use it instead
          const realFilename = filenameForDownload(
            { ...content, mimetype: realMime },
            realMime,
            moduleId,
          );
          const destination = buildMaterialPath(courseId, sectionPosition, moduleId, realFilename);
          const saved = await writeMaterialFile(destination, realDownload.bytes);
          
          if (existing?.local_path && existing.local_path !== destination) {
            await removeMaterialFile(existing.local_path);
          }
          
          save({
            original_filename: realFilename,
            mime_type: realMime,
            local_path: destination,
            file_size: saved.size,
            content_hash: saved.hash,
            status: 'downloaded',
            error_message: null,
            downloaded_at: now,
          });
          return 'downloaded';
        }
      }
    }

    const filename = filenameForDownload(content, mime, moduleId);
    const destination = buildMaterialPath(courseId, sectionPosition, moduleId, filename);
    const saved = await writeMaterialFile(destination, download.bytes);
    save({
      original_filename: filename,
      mime_type: mime,
      local_path: destination,
      file_size: saved.size,
      content_hash: saved.hash,
      status: 'downloaded',
      error_message: null,
      downloaded_at: now,
    });
    return 'downloaded';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown download error';
    const skipped = message.includes('exceeds configured limit');
    save({ local_path: null, file_size: null, content_hash: null, status: skipped ? 'skipped' : 'failed', error_message: message, downloaded_at: null });
    return skipped ? 'skipped' : 'failed';
  }
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
): Promise<{ assignmentsCount: number; todosCreated: number; materialsCount: number; filesDownloaded: number; filesSkipped: number; filesFailed: number }> {
  const db = getDb();

  // Get all local course moodle_ids
  const courses = db.prepare('SELECT id, moodle_id FROM courses').all() as {
    id: number;
    moodle_id: number;
  }[];

  const courseMap = new Map(courses.map((c) => [c.moodle_id, c.id]));
  const courseIds = courses.map((c) => c.moodle_id);

  if (courseIds.length === 0) return { assignmentsCount: 0, todosCreated: 0, materialsCount: 0, filesDownloaded: 0, filesSkipped: 0, filesFailed: 0 };

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

  const checkMaterialExists = db.prepare('SELECT id FROM materials WHERE moodle_id = ?');
  const updateMaterial = db.prepare(`
    UPDATE materials SET
      section_id = @section_id, section_name = @section_name, name = @name, type = @type,
      url = @url, module_url = @module_url, description = @description, visible = @visible,
      last_synced_at = @last_synced_at
    WHERE moodle_id = @moodle_id
  `);
  const insertMaterial = db.prepare(`
    INSERT INTO materials (course_id, moodle_id, section_id, section_name, name, type, url, module_url, description, visible, last_synced_at, created_at)
    VALUES (@course_id, @moodle_id, @section_id, @section_name, @name, @type, @url, @module_url, @description, @visible, @last_synced_at, @created_at)
  `);
  const upsertSection = db.prepare(`
    INSERT INTO course_sections (course_id, moodle_id, position, name, visible, created_at, updated_at)
    VALUES (@course_id, @moodle_id, @position, @name, @visible, @created_at, @updated_at)
    ON CONFLICT(course_id, moodle_id) DO UPDATE SET
      position = excluded.position, name = excluded.name, visible = excluded.visible, updated_at = excluded.updated_at
  `);
  const getSection = db.prepare('SELECT id FROM course_sections WHERE course_id = ? AND moodle_id IS ?');
  const findMaterialFile = db.prepare('SELECT id, local_path, content_hash FROM material_files WHERE material_id = ? AND source_url = ?');
  const insertMaterialFile = db.prepare(`
    INSERT INTO material_files (material_id, source_url, original_filename, mime_type, expected_size, local_path, file_size, content_hash, status, error_message, downloaded_at, created_at, updated_at)
    VALUES (@material_id, @source_url, @original_filename, @mime_type, @expected_size, @local_path, @file_size, @content_hash, @status, @error_message, @downloaded_at, @created_at, @updated_at)
  `);
  const updateMaterialFile = db.prepare(`
    UPDATE material_files SET original_filename = @original_filename, mime_type = @mime_type, expected_size = @expected_size,
      local_path = @local_path, file_size = @file_size, content_hash = @content_hash, status = @status,
      error_message = @error_message, downloaded_at = @downloaded_at, updated_at = @updated_at
    WHERE id = @id
  `);
  const findMaterialFileMime = db.prepare('SELECT mime_type FROM material_files WHERE id = ?');

  let assignmentsCount = 0;
  let todosCreated = 0;
  let materialsCount = 0;
  let filesDownloaded = 0;
  let filesSkipped = 0;
  let filesFailed = 0;

  for (const courseData of response.courses) {
    if (courseData.summary) {
      db.prepare(`UPDATE courses SET summary = ? WHERE moodle_id = ?`).run(courseData.summary, courseData.id);
    }
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

      if (!a.duedate || a.duedate * 1000 > Date.now()) {
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

    if (courseData.materials) {
      for (const m of courseData.materials) {
        const sectionMoodleId = m.sectionId ?? 0;
        upsertSection.run({
          course_id: localCourseId,
          moodle_id: sectionMoodleId,
          position: m.sectionPosition ?? 0,
          name: m.sectionName || 'Contenido del curso',
          visible: m.visible ?? 1,
          created_at: now,
          updated_at: now,
        });
        const localSection = getSection.get(localCourseId, sectionMoodleId) as { id: number } | undefined;
        const materialParams = {
          course_id: localCourseId,
          moodle_id: m.id,
          section_id: localSection?.id ?? null,
          section_name: m.sectionName || 'Contenido del curso',
          name: m.name,
          type: m.type,
          url: m.url,
          module_url: m.url,
          description: m.description || null,
          visible: m.visible ?? 1,
          last_synced_at: now,
          created_at: now,
        };
        let localMaterialId: number;
        if (checkMaterialExists.get(m.id)) {
          updateMaterial.run(materialParams);
          localMaterialId = (checkMaterialExists.get(m.id) as { id: number }).id;
        } else {
          localMaterialId = Number(insertMaterial.run(materialParams).lastInsertRowid);
        }
        materialsCount++;

        const contents = m.contents.length > 0 ? m.contents : await getFallbackModuleContents(sm, session, m);
        for (const content of contents) {
          const result = await syncMaterialFile({
            sm, session, materialId: localMaterialId, courseId: localCourseId,
            sectionPosition: m.sectionPosition ?? 0, moduleId: m.id, content, now,
            findMaterialFile: findMaterialFile as unknown as MaterialFileStatements['findMaterialFile'],
            insertMaterialFile: insertMaterialFile as unknown as MaterialFileStatements['insertMaterialFile'],
            updateMaterialFile: updateMaterialFile as unknown as MaterialFileStatements['updateMaterialFile'],
            findMaterialFileMime: findMaterialFileMime as unknown as MaterialFileStatements['findMaterialFileMime'],
          });
          if (result === 'downloaded') filesDownloaded++;
          else if (result === 'skipped') filesSkipped++;
          else if (result === 'failed') filesFailed++;
        }
      }
    }
  }

  return { assignmentsCount, todosCreated, materialsCount, filesDownloaded, filesSkipped, filesFailed };
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
  logActivity({ category: 'sync', message: 'Moodle sync started' });

  // Capture state before sync for diff computation
  let preSyncState: ReturnType<typeof capturePreSyncState> | null = null;
  try { preSyncState = capturePreSyncState(); } catch { /* first run */ }

  const insertLog = db.prepare(`
    INSERT INTO sync_log (sync_type, status, items_synced, started_at)
    VALUES ('moodle', 'partial', 0, datetime('now'))
  `);
  const logResult = insertLog.run();
  const logId = logResult.lastInsertRowid;

  let coursesCount = 0;
  let assignmentsCount = 0;
  let todosCreated = 0;
  let materialsCount = 0;
  let filesDownloaded = 0;
  let filesSkipped = 0;
  let filesFailed = 0;
  let errorMsg: string | undefined;
  let success = false;

  try {
    const sm = new SessionManager();
    const session = await sm.ensureSession(username, password);

    coursesCount = await syncCourses(sm, session);

    const assignResult = await syncAssignments(sm, session);
    assignmentsCount = assignResult.assignmentsCount;
    todosCreated = assignResult.todosCreated;
    materialsCount = assignResult.materialsCount;
    filesDownloaded = assignResult.filesDownloaded;
    filesSkipped = assignResult.filesSkipped;
    filesFailed = assignResult.filesFailed;

    success = true;
    logActivity({
      category: 'sync',
      message: 'Moodle sync completed',
      durationMs: Date.now() - startTime,
      details: { coursesCount, assignmentsCount, materialsCount, filesDownloaded, filesSkipped, filesFailed },
    });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
    success = false;
    console.error('[Moodle Sync Error]', err);
    logActivity({ category: 'sync', level: 'error', message: errorMsg, durationMs: Date.now() - startTime });
  }

  // Update sync log
  db.prepare(`
    UPDATE sync_log
    SET status = ?, items_synced = ?, error_message = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(
    success ? 'success' : 'failed',
    coursesCount + assignmentsCount + materialsCount,
    errorMsg || null,
    logId,
  );

  // After successful sync, compute and save diff
  if (success && preSyncState) {
    try {
      const diff = computeDiff(preSyncState);
      saveSyncSnapshot(Number(logId), diff);
    } catch (err) {
      console.error('[Sync Diff]', err);
    }
  }

  return {
    success,
    coursesCount,
    assignmentsCount,
    todosCreated,
    materialsCount,
    filesDownloaded,
    filesSkipped,
    filesFailed,
    error: errorMsg,
    durationMs: Date.now() - startTime,
  };
}
