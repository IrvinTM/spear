import { getDb } from '@/lib/db';

export interface SyncDiff {
  newCourses: string[];              // fullnames of newly added courses
  newAssignments: { name: string; courseName: string; dueDate: string | null }[];
  newTodos: { title: string; dueDate: string | null }[];
  newMaterials: { name: string; courseName: string; type: string }[];
  filesDownloaded: { filename: string; courseName: string; mimeType: string | null }[];
  updatedMaterials: { name: string; courseName: string }[];
}

/** Take a snapshot of current IDs before sync starts. */
export function capturePreSyncState(): {
  courseIds: Set<number>;
  assignmentIds: Set<number>;
  todoIds: Set<number>;
  materialIds: Set<number>;
  materialFileIds: Set<number>;
} {
  const db = getDb();
  return {
    courseIds: new Set((db.prepare('SELECT id FROM courses').all() as { id: number }[]).map(r => r.id)),
    assignmentIds: new Set((db.prepare('SELECT id FROM assignments').all() as { id: number }[]).map(r => r.id)),
    todoIds: new Set((db.prepare('SELECT id FROM todos').all() as { id: number }[]).map(r => r.id)),
    materialIds: new Set((db.prepare('SELECT id FROM materials').all() as { id: number }[]).map(r => r.id)),
    materialFileIds: new Set((db.prepare('SELECT id FROM material_files').all() as { id: number }[]).map(r => r.id)),
  };
}

/** Compare current DB state against pre-sync snapshot to build the diff. */
export function computeDiff(preSyncState: ReturnType<typeof capturePreSyncState>): SyncDiff {
  const db = getDb();
  
  const newCourses = (db.prepare(
    'SELECT fullname FROM courses WHERE id NOT IN (SELECT value FROM json_each(?))'
  ).all(JSON.stringify([...preSyncState.courseIds])) as { fullname: string }[])
    .map(r => r.fullname);

  const newAssignments = db.prepare(`
    SELECT a.name, c.fullname as courseName, a.due_date as dueDate
    FROM assignments a JOIN courses c ON c.id = a.course_id
    WHERE a.id NOT IN (SELECT value FROM json_each(?))
  `).all(JSON.stringify([...preSyncState.assignmentIds])) as SyncDiff['newAssignments'];

  const newTodos = db.prepare(`
    SELECT title, due_date as dueDate FROM todos
    WHERE id NOT IN (SELECT value FROM json_each(?))
  `).all(JSON.stringify([...preSyncState.todoIds])) as SyncDiff['newTodos'];

  const newMaterials = db.prepare(`
    SELECT m.name, c.fullname as courseName, m.type
    FROM materials m JOIN courses c ON c.id = m.course_id
    WHERE m.id NOT IN (SELECT value FROM json_each(?))
  `).all(JSON.stringify([...preSyncState.materialIds])) as SyncDiff['newMaterials'];

  const filesDownloaded = db.prepare(`
    SELECT mf.original_filename as filename, c.fullname as courseName, mf.mime_type as mimeType
    FROM material_files mf
    JOIN materials m ON m.id = mf.material_id
    JOIN courses c ON c.id = m.course_id
    WHERE mf.id NOT IN (SELECT value FROM json_each(?))
      AND mf.status = 'downloaded'
  `).all(JSON.stringify([...preSyncState.materialFileIds])) as SyncDiff['filesDownloaded'];

  return {
    newCourses,
    newAssignments,
    newTodos,
    newMaterials,
    filesDownloaded,
    updatedMaterials: [],  // Could be expanded later with content_hash comparison
  };
}

/** Persist the diff to the sync_snapshots table. Returns the snapshot ID. */
export function saveSyncSnapshot(syncLogId: number, diff: SyncDiff): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO sync_snapshots (sync_log_id, diff_json)
    VALUES (?, ?)
  `).run(syncLogId, JSON.stringify(diff));
  return Number(result.lastInsertRowid);
}
