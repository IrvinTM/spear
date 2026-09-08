import { getDb } from '@/lib/db';
import { getCourseMaterialsDirectory } from '@/lib/materials/storage';

interface AgentRunContext {
  assignmentName: string;
  assignmentIntro: string;
  courseName: string;
  materialsDirectory: string;
}

/**
 * Builds the context pack for an assignment.
 */
export async function buildContextPack(todoId: number): Promise<AgentRunContext | null> {
  const db = getDb();
  
  const todo = db.prepare('SELECT source_id, source_type FROM todos WHERE id = ?').get(todoId) as {
    source_id: number;
    source_type: string;
  } | undefined;

  if (!todo || todo.source_type !== 'assignment') return null;

  const assignment = db.prepare(`
    SELECT a.name, a.intro, a.course_id as courseId, c.fullname as courseName
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ?
  `).get(todo.source_id) as { name: string; intro: string; courseId: number; courseName: string } | undefined;

  if (!assignment) return null;

  return {
    assignmentName: assignment.name,
    assignmentIntro: assignment.intro,
    courseName: assignment.courseName,
    materialsDirectory: getCourseMaterialsDirectory(assignment.courseId),
  };
}
