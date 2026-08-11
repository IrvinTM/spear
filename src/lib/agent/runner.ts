import { getDb } from '@/lib/db';
import { streamText } from '@/lib/llm';

export interface AgentRunContext {
  assignmentName: string;
  assignmentIntro: string;
  courseName: string;
  // In a real implementation we would load PDFs/documents here
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
    SELECT a.name, a.intro, c.fullname as courseName 
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    WHERE a.id = ?
  `).get(todo.source_id) as { name: string; intro: string; courseName: string } | undefined;

  if (!assignment) return null;

  return {
    assignmentName: assignment.name,
    assignmentIntro: assignment.intro,
    courseName: assignment.courseName,
  };
}

/**
 * Streams a homework draft from the LLM based on the assignment context.
 */
export async function* streamHomeworkDraft(todoId: number): AsyncGenerator<string> {
  const context = await buildContextPack(todoId);
  if (!context) {
    yield 'Error: Assignment context not found.';
    return;
  }

  // Strip HTML from the intro to feed into the prompt cleanly
  const cleanIntro = context.assignmentIntro.replace(/<[^>]*>?/gm, '');

  const prompt = `
You are an academic assistant helping a student at the University of El Salvador (UES).
Please generate a well-structured outline and an initial draft for the following assignment.
Do not write the final submission, just a strong starting draft for the student to review and complete.

Course: ${context.courseName}
Assignment Name: ${context.assignmentName}

Instructions/Description:
${cleanIntro}

Format the output clearly using Markdown headings for the Outline and the Draft.
  `;

  // We use a high-effort model for complex drafting
  const stream = streamText(prompt, {
    model: 'gemini-3.6-flash-high', // High effort/context model
    timeout: 300000, // 5 minutes timeout for drafting
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}
