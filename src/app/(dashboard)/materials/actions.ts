'use server';

import type { MaterialItem, CourseMaterialGroup } from '@/lib/types';

export async function getMaterials(): Promise<CourseMaterialGroup[]> {
  try {
    const { getDb, initSchema } = await import('@/lib/db');
    initSchema();
    const db = getDb();

    const courses = db.prepare('SELECT id, fullname, summary FROM courses').all() as {
      id: number;
      fullname: string;
      summary: string | null;
    }[];

    const materialRows = db.prepare(`
      SELECT
        m.id, m.course_id as courseId, m.section_name as sectionName, m.name, m.type, m.url,
        mf.original_filename as filename, mf.local_path as localPath, mf.status as fileStatus,
        mf.file_size as fileSize, mf.error_message as fileError
      FROM materials m
      LEFT JOIN material_files mf ON mf.material_id = m.id
      ORDER BY m.course_id, COALESCE((SELECT position FROM course_sections s WHERE s.id = m.section_id), 0), m.name, mf.original_filename
    `).all() as Array<MaterialItem & { courseId: number; sectionName: string | null; localPath: string | null; fileStatus: string | null; fileSize: number | null; fileError: string | null }>;

    return courses.map((c) => ({
      courseId: c.id,
      courseName: c.fullname,
      summary: c.summary || undefined,
      materials: materialRows.filter((material) => material.courseId === c.id),
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
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error generating summary' };
  }
}
