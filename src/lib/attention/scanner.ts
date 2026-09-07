import fs from 'node:fs';
import { getDb, initSchema } from '@/lib/db';
import { extractTextFromPDF } from '@/lib/documents';
import { generateText } from '@/lib/llm';
import { logActivity } from '@/lib/activity-log';
import type { AttentionEvent, AttentionData, AttentionUrgency, AttentionEventType } from '@/lib/types';

interface RawEventExtraction {
  title: string;
  eventType: AttentionEventType;
  weekNumber: number | null;
  startDate: string | null;
  dueDate: string | null;
  dateLabel: string;
  weight: string | null;
  description: string | null;
  priority: number;
}

/**
 * Filters the PDF text to isolate schedule tables and evaluation sections,
 * removing boilerplate and table-of-contents to fit cleanly within LLM context.
 */
export function extractCalendarAndEvalPages(fullText: string): string {
  const pages = fullText.split(/-- \d+ of \d+ --/);
  const selectedPages: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const hasWeekSchedule = /(SEMANA\s+\d+|PROGRAMACI[OÓ]N\s+SEMANAL|CRONOGRAMA DE ACTIVIDADES)/i.test(p);
    const hasEvalTable = /(TABLA DE EVALUACIONES|\d+\.0\s+EVALUACIONES|EVALUACIONES\s*\n\s*La evaluaci)/i.test(p);
    const isToc = p.includes('................') || (p.match(/\d+\.0\s+[A-Z]/g) || []).length > 4;

    if ((hasWeekSchedule || hasEvalTable) && !isToc) {
      selectedPages.push(`--- PÁGINA ${i + 1} ---\n` + p.trim());
    }
  }

  // Fallback if page splitting wasn't matched
  if (selectedPages.length === 0) {
    const cronoIdx = fullText.lastIndexOf('CRONOGRAMA');
    const evalIdx = fullText.lastIndexOf('EVALUACI');
    if (cronoIdx !== -1) return fullText.slice(cronoIdx, cronoIdx + 6000);
    if (evalIdx !== -1) return fullText.slice(evalIdx, evalIdx + 6000);
    return fullText.slice(0, 6000);
  }

  return selectedPages.join('\n\n');
}

/**
 * Analyzes Orientaciones Académicas and planning documents using LLM,
 * and saves extracted academic events into the database.
 */
export async function syncAttentionEventsFromMaterials(force = false): Promise<number> {
  initSchema();
  const db = getDb();
  const startedAt = Date.now();

  // If already parsed and not forced, check count
  if (!force) {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM attention_events').get() as { count: number };
    if (countRow && countRow.count > 0) {
      return countRow.count;
    }
  }

  // Find all downloaded Orientaciones Académicas materials
  const courseMaterials = db.prepare(`
    SELECT m.id, m.name, c.id as course_id, c.fullname as course_name, c.shortname as course_code, mf.local_path
    FROM materials m
    JOIN courses c ON c.id = m.course_id
    JOIN material_files mf ON mf.material_id = m.id
    WHERE (m.name LIKE '%orientaci%' OR mf.original_filename LIKE '%orientaci%')
      AND mf.status = 'downloaded'
  `).all() as Array<{
    id: number;
    name: string;
    course_id: number;
    course_name: string;
    course_code: string;
    local_path: string;
  }>;

  let totalInserted = 0;

  const insertStmt = db.prepare(`
    INSERT INTO attention_events 
      (course_id, course_name, course_code, title, event_type, start_date, due_date, date_label, week_number, weight, description, source_document, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')
    ON CONFLICT(course_id, title, date_label) DO UPDATE SET
      event_type = excluded.event_type,
      start_date = excluded.start_date,
      due_date = excluded.due_date,
      week_number = excluded.week_number,
      weight = excluded.weight,
      description = excluded.description,
      priority = excluded.priority,
      updated_at = datetime('now')
  `);

  for (const cm of courseMaterials) {
    if (!cm.local_path || !fs.existsSync(cm.local_path)) continue;

    try {
      const fullText = await extractTextFromPDF(cm.local_path);
      const relevantText = extractCalendarAndEvalPages(fullText);

      if (relevantText.length < 100) continue;

      const prompt = `Eres el asistente académico inteligente de la plataforma SPEAR para la Universidad de El Salvador (Ciclo II-2026).
Analiza las Orientaciones Académicas de la asignatura "${cm.course_name} (${cm.course_code})".
La fecha actual es 7 de Septiembre de 2026 (Semana 5 del ciclo).

Extrae con máxima precisión TODAS las evaluaciones, exámenes parciales, exámenes cortos, tareas, entregas de proyectos, talleres evaluados y defensas programadas en el cronograma/planificación.

Para cada evaluación extrae:
- title: nombre de la evaluación (ej: "Segundo Examen Parcial", "Primer Examen Parcial", "Trabajo grupal 1", "Examen Corto I", "Taller I", "Entrega de Proyecto")
- eventType: "exam" | "assignment" | "project" | "quiz" | "workshop" | "other"
- weekNumber: número entero de semana (ej: 5, 6, 7, 8, 10, 14...) o null
- startDate: fecha de inicio estimada en formato YYYY-MM-DD (ej: "2026-09-14") o null
- dueDate: fecha límite o de examen estimada en formato YYYY-MM-DD (ej: "2026-09-20") o null
- dateLabel: texto legible con el período o fecha (ej: "Semana 6 · Del 14 al 20 de septiembre de 2026")
- weight: porcentaje o ponderación si aparece (ej: "20%", "10%", "15%") o null
- description: contenido temático, unidades evaluadas o instrucciones clave
- priority: 1 para exámenes parciales o entregas mayores (>=15%), 2 para tareas, talleres y quizzes, 3 para otras actividades

Texto de la programación:
${relevantText.slice(0, 9000)}

Responde ÚNICAMENTE con un JSON válido con este formato:
{
  "events": [
    {
      "title": "...",
      "eventType": "exam",
      "weekNumber": 6,
      "startDate": "2026-09-14",
      "dueDate": "2026-09-20",
      "dateLabel": "Semana 6 · Del 14 al 20 de septiembre de 2026",
      "weight": "20%",
      "description": "...",
      "priority": 1
    }
  ]
}
No agregues comentarios ni markdown fences, responde con el JSON puro.`;

      const response = await generateText(prompt, { timeout: 35000 });
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned) as { events?: RawEventExtraction[] };
      if (Array.isArray(parsed.events)) {
        for (const ev of parsed.events) {
          insertStmt.run(
            cm.course_id,
            cm.course_name,
            cm.course_code,
            ev.title,
            ev.eventType || 'assignment',
            ev.startDate || null,
            ev.dueDate || null,
            ev.dateLabel || `Semana ${ev.weekNumber ?? 'N/A'}`,
            ev.weekNumber || null,
            ev.weight || null,
            ev.description || null,
            cm.name,
            ev.priority || 1,
          );
          totalInserted++;
        }
      }
    } catch (err) {
      console.error(`Error scanning Orientaciones for ${cm.course_name}:`, err);
    }
  }

  // Also integrate active assignments from Moodle that might have deadlines or need attention
  try {
    const activeTodos = db.prepare(`
      SELECT t.id, t.title, t.description, t.due_date as todo_due_date,
             a.id as assign_id, a.name as assign_name, a.due_date as assign_due_date,
             a.submission_status, c.id as course_id, c.fullname as course_name, c.shortname as course_code,
             m.section_name
      FROM todos t
      LEFT JOIN assignments a ON a.id = t.source_id AND t.source_type = 'assignment'
      LEFT JOIN courses c ON c.id = a.course_id
      LEFT JOIN materials m ON m.moodle_id = a.moodle_id AND m.course_id = a.course_id
      WHERE t.status != 'done' AND c.id IS NOT NULL
    `).all() as Array<{
      id: number;
      title: string;
      description: string | null;
      todo_due_date: string | null;
      assign_id: number | null;
      assign_name: string | null;
      assign_due_date: string | null;
      submission_status: string | null;
      course_id: number;
      course_name: string;
      course_code: string;
      section_name: string | null;
    }>;

    const normalizeStr = (str: string): string => {
      return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const matchesEvent = (titleA: string, titleB: string): boolean => {
      const a = normalizeStr(titleA);
      const b = normalizeStr(titleB);
      if (a === b) return true;
      if (a.includes(b) || b.includes(a)) return true;
      const aWords = new Set(a.split(' '));
      const bWords = new Set(b.split(' '));
      const isA1 = aWords.has('1') || aWords.has('primer') || aWords.has('primera');
      const isB1 = bWords.has('1') || bWords.has('primer') || bWords.has('primera');
      const isAGrupal = aWords.has('grupal');
      const isBGrupal = bWords.has('grupal');
      if (isA1 && isB1 && isAGrupal && isBGrupal) return true;
      return false;
    };

    const nowTime = new Date();

    for (const todo of activeTodos) {
      // 1. If already submitted in Moodle, skip from active attention events
      if (todo.submission_status === 'submitted' || todo.submission_status?.toLowerCase().includes('enviado')) {
        continue;
      }

      const moodleDueDate = todo.assign_due_date || todo.todo_due_date || null;

      // 2. If Moodle has a live close/due date, Moodle is the ground truth
      if (moodleDueDate) {
        const dueObj = new Date(moodleDueDate);
        const diffMs = dueObj.getTime() - nowTime.getTime();
        const isToday = diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;

        let dateLabel = '';
        if (isToday) {
          const esTime = new Intl.DateTimeFormat('es-SV', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/El_Salvador',
          }).format(dueObj);
          dateLabel = `Cierre: Hoy a las ${esTime} (Moodle)`;
        } else {
          dateLabel = `Cierre: ${dueObj.toLocaleDateString('es-SV')} (Moodle)`;
        }

        let weekNumber: number | null = null;
        if (dueObj >= new Date('2026-09-07T00:00:00-06:00') && dueObj <= new Date('2026-09-13T23:59:59-06:00')) {
          weekNumber = 5;
        } else if (dueObj >= new Date('2026-09-14T00:00:00-06:00') && dueObj <= new Date('2026-09-20T23:59:59-06:00')) {
          weekNumber = 6;
        }

        insertStmt.run(
          todo.course_id,
          todo.course_name,
          todo.course_code,
          todo.title,
          'assignment',
          null,
          moodleDueDate,
          dateLabel,
          weekNumber,
          null,
          todo.description || (todo.section_name ? `Sección: ${todo.section_name} · Sincronizado de Moodle` : 'Tarea sincronizada desde Moodle'),
          'Moodle Assignment',
          isToday ? 1 : 2,
        );
        totalInserted++;
        continue;
      }

      // 3. If Moodle does NOT have a close date, follow Orientaciones Académicas
      const existingEvents = db.prepare(`
        SELECT id, title, week_number, due_date, date_label, weight
        FROM attention_events
        WHERE course_id = ?
      `).all(todo.course_id) as Array<{
        id: number;
        title: string;
        week_number: number | null;
        due_date: string | null;
        date_label: string;
        weight: string | null;
      }>;

      const matched = existingEvents.find(e => matchesEvent(e.title, todo.title));
      if (matched) {
        // Follow Orientaciones Académicas (already tracked)
        continue;
      }

      // If not matched in syllabus, check section name (e.g. "Semana 4")
      let weekNumber: number | null = null;
      if (todo.section_name) {
        const weekMatch = todo.section_name.match(/Semana\s*(\d+)/i);
        if (weekMatch) {
          weekNumber = parseInt(weekMatch[1], 10);
        }
      }

      insertStmt.run(
        todo.course_id,
        todo.course_name,
        todo.course_code,
        todo.title,
        'assignment',
        null,
        null,
        weekNumber ? `Semana ${weekNumber} (Moodle)` : 'Actividad activa en Moodle',
        weekNumber,
        null,
        todo.description || (todo.section_name ? `Sección: ${todo.section_name}` : 'Tarea sincronizada desde Moodle'),
        'Moodle Assignment',
        2,
      );
      totalInserted++;
    }
  } catch (err) {
    console.error('Error correlating todos in attention events:', err);
  }

  logActivity({
    category: 'sync',
    message: `Academic attention events synchronized: ${totalInserted} events extracted from Orientaciones Académicas`,
    durationMs: Date.now() - startedAt,
  });

  return totalInserted;
}

/**
 * Computes urgency and time remaining relative to the active semester timeline.
 * Current date baseline: September 7, 2026 (Week 5: Sept 7 - Sept 13, 2026).
 */
export function calculateUrgency(
  dueDateStr: string | null,
  weekNumber: number | null,
  now: Date,
): { urgency: AttentionUrgency; daysRemaining: number | null } {
  // Baseline for Ciclo II-2026:
  // Week 5 is current week (Sept 7 - Sept 13, 2026)
  // Week 6 is next week (Sept 14 - Sept 20, 2026)
  const currentWeek = 5;
  const week5End = new Date('2026-09-13T23:59:59');
  const week6End = new Date('2026-09-20T23:59:59');
  const upcomingEnd = new Date('2026-10-04T23:59:59');

  if (weekNumber !== null) {
    if (weekNumber < currentWeek) {
      return { urgency: 'past', daysRemaining: (weekNumber - currentWeek) * 7 };
    }
    if (weekNumber === currentWeek) {
      return { urgency: 'this_week', daysRemaining: 3 };
    }
    if (weekNumber === currentWeek + 1) {
      return { urgency: 'next_week', daysRemaining: 7 };
    }
    if (weekNumber <= currentWeek + 3) {
      return { urgency: 'upcoming', daysRemaining: (weekNumber - currentWeek) * 7 };
    }
    return { urgency: 'future', daysRemaining: (weekNumber - currentWeek) * 7 };
  }

  if (dueDateStr) {
    const due = new Date(dueDateStr);
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < -2 * 60 * 60 * 1000) {
      return { urgency: 'past', daysRemaining: diffDays };
    }
    // Items due today / within next 24 hours
    if (diffMs >= -2 * 60 * 60 * 1000 && diffMs <= 24 * 60 * 60 * 1000) {
      return { urgency: 'immediate', daysRemaining: 0 };
    }
    if (due <= week5End || diffDays <= 6) {
      return { urgency: 'this_week', daysRemaining: Math.max(1, diffDays) };
    }
    if (due <= week6End || diffDays <= 13) {
      return { urgency: 'next_week', daysRemaining: diffDays };
    }
    if (due <= upcomingEnd) {
      return { urgency: 'upcoming', daysRemaining: diffDays };
    }
    return { urgency: 'future', daysRemaining: diffDays };
  }

  return { urgency: 'upcoming', daysRemaining: null };
}

/**
 * Retrieves the attention events organized by priority and due date,
 * highlighting the top 3 critical events so nothing is missed.
 */
export async function getAttentionData(forceRefresh = false): Promise<AttentionData> {
  initSchema();
  const db = getDb();

  // If table is empty, auto-sync
  const countRow = db.prepare("SELECT COUNT(*) as count FROM attention_events WHERE status != 'completed'").get() as { count: number };
  if (forceRefresh || !countRow || countRow.count === 0) {
    await syncAttentionEventsFromMaterials(forceRefresh);
  }

  const rows = db.prepare(`
    SELECT 
      id, course_id, course_name, course_code, title, event_type,
      start_date, due_date, date_label, week_number, weight,
      description, source_document, priority, status, updated_at
    FROM attention_events
    WHERE status != 'completed' AND status != 'dismissed'
    ORDER BY 
      CASE WHEN week_number IS NOT NULL THEN week_number ELSE 99 END ASC,
      CASE WHEN due_date IS NOT NULL THEN due_date ELSE '9999-12-31' END ASC,
      priority ASC
  `).all() as Array<{
    id: number;
    course_id: number;
    course_name: string;
    course_code: string | null;
    title: string;
    event_type: AttentionEventType;
    start_date: string | null;
    due_date: string | null;
    date_label: string;
    week_number: number | null;
    weight: string | null;
    description: string | null;
    source_document: string | null;
    priority: number;
    status: 'upcoming' | 'in_progress' | 'completed' | 'dismissed';
    updated_at: string;
  }>;

  // Reference date: Sept 7, 2026
  const now = new Date();
  const currentWeek = 5;

  const events: AttentionEvent[] = rows.map((r) => {
    const { urgency, daysRemaining } = calculateUrgency(r.due_date, r.week_number, now);
    return {
      id: r.id,
      courseId: r.course_id,
      courseName: r.course_name,
      courseCode: r.course_code || undefined,
      title: r.title,
      eventType: r.event_type,
      startDate: r.start_date,
      dueDate: r.due_date,
      dateLabel: r.date_label,
      weekNumber: r.week_number,
      weight: r.weight,
      description: r.description,
      sourceDocument: r.source_document,
      priority: r.priority,
      urgency,
      daysRemaining,
      status: r.status,
    };
  });

  // Prioritize tasks according to:
  // 1. Task in the week that I'm on ('this_week' or 'immediate')
  // 2. Next week tasks ('next_week', e.g. Week 6)
  // 3. Upcoming tasks sorted by urgency and priority (exams first)
  const sorted = [...events].sort((a, b) => {
    const urgencyWeight: Record<AttentionUrgency, number> = {
      immediate: 0,
      this_week: 1,
      next_week: 2,
      upcoming: 3,
      future: 4,
      past: 5,
    };

    const diffUrgency = urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
    if (diffUrgency !== 0) return diffUrgency;

    const diffWeek = (a.weekNumber ?? 99) - (b.weekNumber ?? 99);
    if (diffWeek !== 0) return diffWeek;

    const diffPriority = a.priority - b.priority;
    if (diffPriority !== 0) return diffPriority;

    return (a.dueDate || '').localeCompare(b.dueDate || '');
  });

  // Partition into:
  // 1. This Week: current week events (Week 5 or due within Sept 7 - Sept 13)
  const thisWeekEvents = sorted.filter(
    (e) =>
      e.urgency !== 'past' &&
      (e.urgency === 'immediate' || e.urgency === 'this_week' || e.weekNumber === currentWeek)
  );

  // 2. Upcoming / Next weeks: all future events not in thisWeekEvents, sorted by urgency and due date
  const upcomingEvents = sorted.filter(
    (e) =>
      e.urgency !== 'past' &&
      !thisWeekEvents.some((tw) => tw.id === e.id)
  );

  // Top 3 priority upcoming items for immediate focus
  const topEvents = upcomingEvents.slice(0, 3);

  // Generate an attention summary headline
  let summary = '';
  const nextWeekEvents = upcomingEvents.filter(e => e.urgency === 'next_week' || e.weekNumber === 6);
  const examCount = nextWeekEvents.filter(e => e.eventType === 'exam').length;
  const homeworkCount = nextWeekEvents.filter(e => e.eventType === 'assignment' || e.eventType === 'project').length;

  if (thisWeekEvents.length > 0) {
    const todayEvents = thisWeekEvents.filter(e => e.urgency === 'immediate' || e.daysRemaining === 0);
    if (todayEvents.length > 0) {
      summary = `¡Atención urgente! Tienes ${
        todayEvents.length === 1 ? `la tarea "${todayEvents[0].title}"` : `${todayEvents.length} tareas`
      } con cierre programado para HOY en Moodle (${todayEvents.map(t => t.courseName).join(', ')}).`;
      if (nextWeekEvents.length > 0) {
        summary += ` Además, prepárate para la próxima semana (Semana 6): tienes ${examCount} exámenes parciales en camino.`;
      }
    } else {
      summary = `Tienes ${thisWeekEvents.length} actividad(es) esta semana (Semana 5) que requieren tu atención.`;
    }
  } else if (nextWeekEvents.length > 0) {
    summary = `¡Atención! La próxima semana (Semana 6 · Del 14 al 20 de Septiembre) requiere tu máxima preparación: tienes ${
      examCount > 0 ? `${examCount} examen${examCount > 1 ? 'es' : ''} parcial${examCount > 1 ? 'es' : ''}` : ''
    }${examCount > 0 && homeworkCount > 0 ? ' y ' : ''}${
      homeworkCount > 0 ? `${homeworkCount} entrega${homeworkCount > 1 ? 's' : ''}` : ''
    } programados según las Orientaciones Académicas.`;
  } else if (upcomingEvents.length > 0) {
    summary = `Tienes ${upcomingEvents.length} eventos académicos clave identificados en las Orientaciones Académicas que requieren tu seguimiento.`;
  } else {
    summary = 'No hay eventos académicos urgentes pendientes en las próximas semanas.';
  }

  const lastRow = rows[0];
  const lastAnalyzedAt = lastRow ? lastRow.updated_at : null;

  return {
    currentWeek,
    currentWeekLabel: 'Semana 5 (Del 07 al 13 de septiembre de 2026)',
    currentDate: now.toISOString(),
    thisWeekEvents,
    upcomingEvents,
    topEvents,
    allEvents: sorted.filter(e => e.urgency !== 'past'),
    summary,
    lastAnalyzedAt,
  };
}
