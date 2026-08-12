'use server';

import type { MaterialItem, CourseMaterialGroup } from '@/lib/types';

export async function getMaterials(): Promise<CourseMaterialGroup[]> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    const courses = db.prepare('SELECT id, fullname, summary FROM courses').all() as {
      id: number;
      fullname: string;
      summary: string | null;
    }[];

    return courses.map((c) => ({
      courseId: c.id,
      courseName: c.fullname,
      summary: c.summary || undefined,
      materials: [], // We haven't built the materials sync logic yet
    }));
  } catch {
    return [];
  }
}

export async function generateAiSummary(courseId: number, rawSummary: string): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const { getDb } = await import('@/lib/db');
    const { generateText } = await import('@/lib/llm');
    const db = getDb();
    
    const prompt = `Analiza la estructura de este curso y genera un breve resumen en español. 
    A continuación los datos crudos extraídos de Moodle:
    ${rawSummary}
    
    Escribe un párrafo muy corto (2-3 oraciones) amigable y directo, resumiendo cuántos temas hay, cuál es el último, y mencionando brevemente los materiales disponibles. No uses saludos, ve directo al grano.`;

    const summary = await generateText(prompt, { timeout: 15000 });
    
    db.prepare(`UPDATE courses SET summary = ? WHERE id = ?`).run(summary, courseId);
    return { success: true, text: summary };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error generating summary' };
  }
}
