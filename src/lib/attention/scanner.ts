import fs from 'node:fs';
import { getDb, initSchema } from '@/lib/db';
import { extractTextFromPDF } from '@/lib/documents';
import { generateText } from '@/lib/llm';
import { logActivity } from '@/lib/activity-log';
import {
  getAcademicWeekForDate,
  getCurrentAcademicWeek,
  getWeekRange,
  formatCurrentDateEs,
} from '@/lib/attention/calendar';
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
function extractCalendarAndEvalPages(fullText: string): string {
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

function normalizeTitle(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(titleA: string, titleB: string): boolean {
  const a = normalizeTitle(titleA);
  const b = normalizeTitle(titleB);
  if (!a || !b) return false;
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
}

/**
 * Marks stale attention events as completed so they stop showing in
 * "This Week": past due dates, past weeks without due date, submitted
 * Moodle assignments and todos already marked done. Also collapses
 * duplicate Moodle rows (same course + title + due date) keeping the
 * oldest id.
 */
function reconcileAttentionEvents(now: Date, currentWeek: number): void {
  const db = getDb();
  const cutoff = now.getTime() - 2 * 60 * 60 * 1000;

  try {
    const active = db.prepare(`
      SELECT id, course_id, title, due_date, week_number, date_label
      FROM attention_events
      WHERE status IN ('upcoming', 'in_progress')
    `).all() as Array<{
      id: number;
      course_id: number;
      title: string;
      due_date: string | null;
      week_number: number | null;
      date_label: string;
    }>;

    const completeStmt = db.prepare(
      "UPDATE attention_events SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
    );
    const toComplete = new Set<number>();

    // 1. Past due dates are done — due date is ground truth even if weekNumber is current.
    for (const ev of active) {
      if (ev.due_date) {
        const due = new Date(ev.due_date);
        if (!Number.isNaN(due.getTime()) && due.getTime() < cutoff) {
          toComplete.add(ev.id);
        }
      } else if (ev.week_number !== null && ev.week_number < currentWeek) {
        // 2. Syllabus-only events from past weeks with no due date.
        toComplete.add(ev.id);
      }
    }

    // 3. Submitted Moodle work / todos marked done should disappear from attention.
    try {
      const doneTodos = db.prepare(`
        SELECT t.title,
               COALESCE(a.course_id, am.course_id) as course_id,
               COALESCE(a.name, t.title) as assign_name
        FROM todos t
        LEFT JOIN assignments a ON a.id = t.source_id AND t.source_type = 'assignment'
        LEFT JOIN assignments am ON am.name = t.title
        WHERE t.status = 'done'
      `).all() as Array<{ title: string; course_id: number | null; assign_name: string | null }>;

      const submitted = db.prepare(`
        SELECT course_id, name FROM assignments
        WHERE submission_status = 'submitted'
           OR lower(submission_status) LIKE '%enviado%'
      `).all() as Array<{ course_id: number; name: string }>;

      const finishedByCourse = new Map<number, string[]>();
      const pushFinished = (courseId: number | null, name: string | null) => {
        if (!courseId || !name) return;
        const list = finishedByCourse.get(courseId) ?? [];
        list.push(name);
        finishedByCourse.set(courseId, list);
      };
      for (const t of doneTodos) {
        pushFinished(t.course_id, t.assign_name || t.title);
        pushFinished(t.course_id, t.title);
      }
      for (const s of submitted) pushFinished(s.course_id, s.name);

      if (finishedByCourse.size > 0) {
        for (const ev of active) {
          if (toComplete.has(ev.id)) continue;
          const finished = finishedByCourse.get(ev.course_id);
          if (!finished) continue;
          if (finished.some((f) => titlesMatch(ev.title, f))) {
            toComplete.add(ev.id);
          }
        }
      }
    } catch (err) {
      console.error('Error reconciling finished todos in attention events:', err);
    }

    // 4. Collapse duplicates: same course + normalized title + same due/week → keep oldest.
    try {
      const seen = new Map<string, number>();
      const ordered = [...active].sort((a, b) => a.id - b.id);
      for (const ev of ordered) {
        if (toComplete.has(ev.id)) continue;
        const key = `${ev.course_id}|${normalizeTitle(ev.title)}|${ev.due_date ?? ''}|${ev.due_date ? '' : String(ev.week_number ?? '')}`;
        const first = seen.get(key);
        if (first === undefined) {
          seen.set(key, ev.id);
        } else {
          toComplete.add(ev.id);
        }
      }
    } catch (err) {
      console.error('Error deduplicating attention events:', err);
    }

    if (toComplete.size > 0) {
      const tx = db.transaction((ids: number[]) => {
        for (const id of ids) completeStmt.run(id);
      });
      tx([...toComplete]);
    }
  } catch (err) {
    console.error('Error reconciling attention events:', err);
  }
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

      const { week: promptWeek } = getCurrentAcademicWeek(new Date());
      const promptDate = formatCurrentDateEs(new Date());
      const prompt = `Eres el asistente académico inteligente de la plataforma SPEAR para la Universidad de El Salvador (Ciclo II-2026).
Analiza las Orientaciones Académicas de la asignatura "${cm.course_name} (${cm.course_code})".
La fecha actual es ${promptDate} (Semana ${promptWeek} del ciclo).

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

    const findCourseEventsStmt = db.prepare(`
      SELECT id, title, week_number, due_date, date_label
      FROM attention_events
      WHERE course_id = ? AND status IN ('upcoming', 'in_progress')
    `);
    const updateMoodleEventStmt = db.prepare(`
      UPDATE attention_events
      SET due_date = ?, date_label = ?, week_number = ?, description = ?, priority = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const completeEventStmt = db.prepare(
      "UPDATE attention_events SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
    );

    for (const todo of activeTodos) {
      // 1. If already submitted in Moodle, complete any tracked event instead of leaving it stale.
      if (todo.submission_status === 'submitted' || todo.submission_status?.toLowerCase().includes('enviado')) {
        try {
          const existing = findCourseEventsStmt.all(todo.course_id) as Array<{
            id: number;
            title: string;
            week_number: number | null;
            due_date: string | null;
            date_label: string;
          }>;
          for (const ev of existing) {
            if (titlesMatch(ev.title, todo.title)) {
              completeEventStmt.run(ev.id);
            }
          }
        } catch (err) {
          console.error('Error completing submitted attention event:', err);
        }
        continue;
      }

      const moodleDueDate = todo.assign_due_date || todo.todo_due_date || null;

      // 2. If Moodle has a live close/due date, Moodle is the ground truth.
      // dateLabel stays stable (no frozen "Hoy" text) so re-syncs update the
      // same row instead of creating duplicates; "Hoy / Hace N días" is computed at read time.
      if (moodleDueDate) {
        const dueObj = new Date(moodleDueDate);
        if (Number.isNaN(dueObj.getTime())) continue;
        // Past-due Moodle items must not create new rows; reconcile() completes the old ones.
        if (dueObj.getTime() < nowTime.getTime() - 2 * 60 * 60 * 1000) {
          try {
            const existing = findCourseEventsStmt.all(todo.course_id) as Array<{
              id: number;
              title: string;
              week_number: number | null;
              due_date: string | null;
              date_label: string;
            }>;
            for (const ev of existing) {
              if (titlesMatch(ev.title, todo.title)) {
                completeEventStmt.run(ev.id);
              }
            }
          } catch (err) {
            console.error('Error completing past-due attention event:', err);
          }
          continue;
        }

        const diffMs = dueObj.getTime() - nowTime.getTime();
        const isToday = diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000;
        const dateLabel = `Cierre: ${dueObj.toLocaleDateString('es-SV', { timeZone: 'America/El_Salvador' })} (Moodle)`;
        const weekNumber: number | null = getAcademicWeekForDate(dueObj);
        const description =
          todo.description ||
          (todo.section_name
            ? `Sección: ${todo.section_name} · Sincronizado de Moodle`
            : 'Tarea sincronizada desde Moodle');
        const priority = isToday ? 1 : 2;

        try {
          const existing = findCourseEventsStmt.all(todo.course_id) as Array<{
            id: number;
            title: string;
            week_number: number | null;
            due_date: string | null;
            date_label: string;
          }>;
          const match = existing.find((e) => titlesMatch(e.title, todo.title));
          if (match) {
            updateMoodleEventStmt.run(moodleDueDate, dateLabel, weekNumber, description, priority, match.id);
          } else {
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
              description,
              'Moodle Assignment',
              priority,
            );
            totalInserted++;
          }
        } catch (err) {
          console.error('Error upserting Moodle attention event:', err);
        }
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
 * Computes urgency and time remaining relative to the live academic calendar.
 * Due date is ground truth: past-due items are always 'past' even when their
 * syllabus weekNumber looks current (prevents old assignments sticking in This Week).
 */
function calculateUrgency(
  dueDateStr: string | null,
  weekNumber: number | null,
  now: Date,
): { urgency: AttentionUrgency; daysRemaining: number | null } {
  const currentWeek = getAcademicWeekForDate(now);
  const { end: weekEnd } = getWeekRange(currentWeek);
  const { end: nextWeekEnd } = getWeekRange(currentWeek + 1);
  const { end: upcomingEnd } = getWeekRange(currentWeek + 3);

  // Due date wins for past / immediate detection.
  if (dueDateStr) {
    const due = new Date(dueDateStr);
    if (!Number.isNaN(due.getTime())) {
      const diffMs = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffMs < -2 * 60 * 60 * 1000) {
        return { urgency: 'past', daysRemaining: diffDays };
      }
      // Items due today / within next 24 hours
      if (diffMs <= 24 * 60 * 60 * 1000) {
        return { urgency: 'immediate', daysRemaining: 0 };
      }
      if (due <= weekEnd) {
        return { urgency: 'this_week', daysRemaining: Math.max(1, diffDays) };
      }
      if (due <= nextWeekEnd) {
        return { urgency: 'next_week', daysRemaining: diffDays };
      }
      if (due <= upcomingEnd) {
        return { urgency: 'upcoming', daysRemaining: diffDays };
      }
      return { urgency: 'future', daysRemaining: diffDays };
    }
  }

  if (weekNumber !== null) {
    if (weekNumber < currentWeek) {
      return { urgency: 'past', daysRemaining: (weekNumber - currentWeek) * 7 };
    }
    if (weekNumber === currentWeek) {
      const daysTillEnd = Math.max(
        0,
        Math.ceil((weekEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      return { urgency: 'this_week', daysRemaining: daysTillEnd };
    }
    if (weekNumber === currentWeek + 1) {
      return { urgency: 'next_week', daysRemaining: 7 };
    }
    if (weekNumber <= currentWeek + 3) {
      return { urgency: 'upcoming', daysRemaining: (weekNumber - currentWeek) * 7 };
    }
    return { urgency: 'future', daysRemaining: (weekNumber - currentWeek) * 7 };
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
  const now = new Date();
  const { week: currentWeek, label: currentWeekLabel } = getCurrentAcademicWeek(now);

  // If table is empty, auto-sync
  const countRow = db.prepare("SELECT COUNT(*) as count FROM attention_events WHERE status != 'completed'").get() as { count: number };
  if (forceRefresh || !countRow || countRow.count === 0) {
    await syncAttentionEventsFromMaterials(forceRefresh);
  }

  // Always reconcile on read (cheap, no LLM): completes past-due, submitted/done,
  // and duplicate rows so This Week never shows stale assignments.
  reconcileAttentionEvents(now, currentWeek);

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

  // Reference date: live clock + academic calendar (no hardcoded week).
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
  // 1. This Week: current-week events (urgency this_week/immediate or weekNumber == currentWeek)
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
  const nextWeekEvents = upcomingEvents.filter(e => e.urgency === 'next_week' || e.weekNumber === currentWeek + 1);
  const examCount = nextWeekEvents.filter(e => e.eventType === 'exam').length;
  const homeworkCount = nextWeekEvents.filter(e => e.eventType === 'assignment' || e.eventType === 'project').length;
  const nextWeekLabel = `Semana ${currentWeek + 1}`;

  if (thisWeekEvents.length > 0) {
    const todayEvents = thisWeekEvents.filter(e => e.urgency === 'immediate' || e.daysRemaining === 0);
    if (todayEvents.length > 0) {
      summary = `¡Atención urgente! Tienes ${
        todayEvents.length === 1 ? `la tarea "${todayEvents[0].title}"` : `${todayEvents.length} tareas`
      } con cierre programado para HOY en Moodle (${todayEvents.map(t => t.courseName).join(', ')}).`;
      if (nextWeekEvents.length > 0) {
        summary += ` Además, prepárate para la próxima semana (${nextWeekLabel}): tienes ${examCount} exámenes parciales en camino.`;
      }
    } else {
      summary = `Tienes ${thisWeekEvents.length} actividad(es) esta semana (Semana ${currentWeek}) que requieren tu atención.`;
    }
  } else if (nextWeekEvents.length > 0) {
    summary = `¡Atención! La próxima semana (${nextWeekLabel}) requiere tu máxima preparación: tienes ${
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
    currentWeekLabel,
    currentDate: now.toISOString(),
    thisWeekEvents,
    upcomingEvents,
    topEvents,
    allEvents: sorted.filter(e => e.urgency !== 'past'),
    summary,
    lastAnalyzedAt,
  };
}
