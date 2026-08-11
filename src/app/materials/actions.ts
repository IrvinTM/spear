'use server';

export interface MaterialItem {
  id: number;
  courseName: string;
  name: string;
  type: string;
  url: string | null;
  filename: string | null;
}

export interface CourseMaterialGroup {
  courseId: number;
  courseName: string;
  materials: MaterialItem[];
}

export async function getMaterials(): Promise<CourseMaterialGroup[]> {
  try {
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    // In a real implementation we would query the materials table.
    // For now, let's just return a placeholder or query an empty table, as the
    // sync engine didn't yet extract generic materials (only assignments).
    const courses = db.prepare('SELECT id, fullname FROM courses').all() as {
      id: number;
      fullname: string;
    }[];

    return courses.map((c) => ({
      courseId: c.id,
      courseName: c.fullname,
      materials: [], // We haven't built the materials sync logic yet, we'll do it later
    }));
  } catch {
    return [];
  }
}
