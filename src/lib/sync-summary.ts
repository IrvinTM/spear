import { getDb } from '@/lib/db';
import { generateText } from '@/lib/llm';
import type { SyncDiff } from '@/lib/sync-diff';

/** Builds a compact prompt from the diff data and current active state. */
function buildSummaryPrompt(diff: SyncDiff, activeTodos: { title: string; dueDate: string | null; status: string }[]): string {
  const parts: string[] = [];

  const hasNew = diff.newCourses.length > 0 || diff.newAssignments.length > 0 || diff.newTodos.length > 0 || diff.newMaterials.length > 0 || diff.filesDownloaded.length > 0;

  if (hasNew) {
    parts.push('NOVEDADES DE LA ÚLTIMA SINCRONIZACIÓN:');
    if (diff.newCourses.length > 0) parts.push(`Nuevos cursos: ${diff.newCourses.join(', ')}`);
    if (diff.newAssignments.length > 0) {
      for (const a of diff.newAssignments) parts.push(`- Nueva tarea: "${a.name}" (${a.courseName}) — ${a.dueDate || 'sin fecha'}`);
    }
    if (diff.newTodos.length > 0) parts.push(`- Se crearon ${diff.newTodos.length} nuevos pendientes automáticamente.`);
    if (diff.newMaterials.length > 0) {
      for (const m of diff.newMaterials) parts.push(`- Nuevo material: "${m.name}" (${m.courseName})`);
    }
  } else {
    parts.push('NOVEDADES DE LA SINCRONIZACIÓN:\nNo se detectaron cambios nuevos en Moodle.');
  }

  parts.push('\nESTADO ACTUAL DE TAREAS PENDIENTES:');
  if (activeTodos.length === 0) {
    parts.push('No hay tareas pendientes en este momento. ¡Todo al día!');
  } else {
    for (const t of activeTodos) {
      parts.push(`- "${t.title}" (Estado: ${t.status}) — Vence: ${t.dueDate || 'sin fecha'}`);
    }
  }

  return `Eres Campus Copilot. Debes dar un reporte de estado al estudiante.
A continuación los datos:

${parts.join('\n')}

Genera un resumen breve y claro en español (máximo 4-5 oraciones) que:
1. Mencione brevemente si hubo o no novedades en la última sincronización.
2. Resuma el estado actual general y destaque las 1 o 2 tareas pendientes más urgentes.
3. Dé una recomendación práctica sobre qué hacer a continuación.
4. Use un tono directo y amigable, como un compañero de estudio.

IMPORTANTE: No uses emojis, asteriscos, ni formato markdown. Solo texto plano y puntuación básica.`;
}

/** Generates and persists an AI summary for a sync snapshot. */
export async function generateSyncSummary(snapshotId: number): Promise<string | null> {
  const db = getDb();
  const row = db.prepare('SELECT diff_json, summary_text FROM sync_snapshots WHERE id = ?')
    .get(snapshotId) as { diff_json: string; summary_text: string | null } | undefined;
  
  if (!row) return null;
  if (row.summary_text) return row.summary_text;  // Already generated

  const diff: SyncDiff = JSON.parse(row.diff_json);
  
  // Fetch active todos to provide current state context
  const activeTodos = db.prepare(`
    SELECT title, due_date as dueDate, status 
    FROM todos 
    WHERE status != 'done' 
    ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC 
    LIMIT 10
  `).all() as { title: string; dueDate: string | null; status: string }[];

  const prompt = buildSummaryPrompt(diff, activeTodos);

  const summary = await generateText(prompt, { timeout: 30000 });
  db.prepare('UPDATE sync_snapshots SET summary_text = ? WHERE id = ?').run(summary, snapshotId);
  return summary;
}
