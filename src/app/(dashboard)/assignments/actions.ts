import { getDb } from '@/lib/db';

export interface AssignmentWithDraft {
  id: number;
  todoId: number;
  name: string;
  courseName: string;
  intro: string | null;
  dueDate: string | null;
  todoStatus: string;
  draftStatus: string | null;
  draftId: number | null;
  draft: string | null;
}

export async function getAssignmentsWithDrafts(): Promise<AssignmentWithDraft[]> {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        a.id,
        t.id as todoId,
        a.name,
        c.fullname as courseName,
        a.intro,
        a.due_date as dueDate,
        t.status as todoStatus,
        ar.id as draftId,
        ar.status as draftStatus,
        ar.draft
      FROM assignments a
      JOIN courses c ON c.id = a.course_id
      LEFT JOIN todos t ON t.source_id = a.id AND t.source_type = 'assignment'
      LEFT JOIN agent_runs ar ON ar.todo_id = t.id AND ar.id = (
        SELECT id FROM agent_runs WHERE todo_id = t.id ORDER BY id DESC LIMIT 1
      )
      ORDER BY a.name ASC
    `).all() as AssignmentWithDraft[];
    return rows;
  } catch {
    return [];
  }
}
