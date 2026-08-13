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
  
  return contextText;
}
