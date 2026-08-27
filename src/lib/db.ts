import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { getAgentHome } from '@/lib/config';
import { runMigrations } from '@/lib/migrations/runner';

let dbInstance: Database.Database | null = null;

/**
 * Determines the database file path and ensures the directory exists.
 */
function getDbPath(): string {
  const agentHome = getAgentHome();
  const dataDir = path.join(agentHome, 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return path.join(dataDir, 'campus-copilot.db');
}

/**
 * Gets the singleton database instance, initializing it if needed.
 * Sets WAL mode for safe concurrent reads/writes.
 *
 * @returns The active SQLite database connection
 */
export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(getDbPath());
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

/**
 * Closes the database connection cleanly.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Initializes the database schema by running pending SQL migrations.
 * Migrations live in src/lib/migrations/ as numbered .sql files (e.g. 001_initial.sql).
 */
export function initSchema(): void {
  const db = getDb();
  runMigrations(db);
}

// Note: better-sqlite3 handles cleanup automatically via its native destructor.
// Do not register process signal handlers here — it interferes with Next.js lifecycle.

export function getGlobalContext() {
  const db = getDb();
  
  const courses = db.prepare('SELECT fullname, summary FROM courses WHERE visible = 1').all() as { fullname: string; summary: string | null }[];
  
  const todos = db.prepare(`
    SELECT title, due_date, status, source_type
    FROM todos 
    WHERE status != 'done' 
    ORDER BY due_date ASC 
    LIMIT 10
  `).all() as { title: string; due_date: string | null; status: string; source_type: string }[];
  
  let contextText = `### Cursos Actuales:\n`;
  if (courses.length === 0) contextText += `No hay cursos sincronizados.\n`;
  courses.forEach(c => {
    contextText += `- ${c.fullname}\n  Info: ${c.summary ? c.summary.replace(/\n/g, ' ') : 'Sin resumen'}\n`;
  });
  
  contextText += `\n### Próximas Tareas (Todos):\n`;
  if (todos.length === 0) contextText += `No hay tareas pendientes.\n`;
  todos.forEach(t => {
    contextText += `- [${t.status}] ${t.title} (Para: ${t.due_date || 'Sin fecha'}) [Origen: ${t.source_type}]\n`;
  });

  const materials = db.prepare(`
    SELECT c.fullname as courseName, COALESCE(s.name, m.section_name, 'Contenido') as sectionName,
      COALESCE(mf.original_filename, m.name) as materialName, mf.status
    FROM materials m
    JOIN courses c ON c.id = m.course_id
    LEFT JOIN course_sections s ON s.id = m.section_id
    LEFT JOIN material_files mf ON mf.material_id = m.id
    ORDER BY c.fullname, sectionName, materialName
  `).all() as { courseName: string; sectionName: string; materialName: string; status: string | null }[];
  contextText += `\n### Materiales guardados:\n`;
  if (materials.length === 0) contextText += `No hay materiales descargados todavía.\n`;
  materials.forEach((material) => {
    contextText += `- ${material.courseName} / ${material.sectionName}: ${material.materialName}${material.status ? ` (${material.status})` : ''}\n`;
  });

  const emails = db.prepare(`
    SELECT from_name, subject, summary, received_at
    FROM emails
    ORDER BY received_at DESC
    LIMIT 10
  `).all() as { from_name: string | null; subject: string; summary: string | null; received_at: string }[];
  contextText += `\n### Correos recientes (Emails):\n`;
  if (emails.length === 0) contextText += `No hay correos recientes.\n`;
  emails.forEach((email) => {
    contextText += `- De: ${email.from_name || 'Desconocido'} | Asunto: ${email.subject} | Recibido: ${email.received_at}\n  Resumen: ${email.summary ? email.summary.replace(/\n/g, ' ') : 'Sin resumen'}\n`;
  });
  
  return contextText;
}

/** Returns a course only when the message contains one unambiguous course name or code. */
export function findCourseForMessage(message: string): { id: number; fullname: string } | null {
  const normalized = message.toLocaleLowerCase();
  const courses = getDb().prepare('SELECT id, fullname, shortname FROM courses WHERE visible = 1').all() as {
    id: number; fullname: string; shortname: string;
  }[];
  const matches = courses.filter((course) => {
    const fullname = course.fullname.toLocaleLowerCase();
    const shortname = course.shortname.toLocaleLowerCase();
    return (fullname.length >= 4 && normalized.includes(fullname)) ||
      (shortname.length >= 3 && normalized.includes(shortname));
  });
  return matches.length === 1 ? { id: matches[0].id, fullname: matches[0].fullname } : null;
}

export interface CourseWithMaterials {
  id: number;
  fullname: string;
  shortname: string;
  materials: { name: string; filename: string | null; localPath: string | null; sectionName: string }[];
}

export function getCoursesWithMaterials(): CourseWithMaterials[] {
  const db = getDb();
  const courses = db.prepare('SELECT id, fullname, shortname FROM courses WHERE visible = 1').all() as {
    id: number; fullname: string; shortname: string;
  }[];
  const stmt = db.prepare(`
    SELECT m.name, mf.original_filename as filename, mf.local_path as localPath,
      COALESCE(s.name, m.section_name, 'General') as sectionName
    FROM materials m
    LEFT JOIN material_files mf ON mf.material_id = m.id
    LEFT JOIN course_sections s ON s.id = m.section_id
    WHERE m.course_id = ?
    ORDER BY sectionName, m.name
  `);
  return courses.map(c => ({
    ...c,
    materials: stmt.all(c.id) as CourseWithMaterials['materials'],
  }));
}
