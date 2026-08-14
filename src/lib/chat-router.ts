import { getCoursesWithMaterials, type CourseWithMaterials } from '@/lib/db';
import { getCourseMaterialsDirectory } from '@/lib/materials/storage';
import { extractTextFromPDF } from '@/lib/documents';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { logActivity } from '@/lib/activity-log';

export interface ChatIntent {
  courseId: number | null;
  courseName: string | null;
  relevantFiles: string[];
  directoryHint: string | null;
  materialsContext: string;
  preloadedContent: string;
}

const KEYWORD_MAP: Record<string, string[]> = {
  orientaciones: ['orientacion', 'orientaciones', 'programa', 'planificacion', 'planeacion', 'syllabus', 'evaluacion', 'evaluaciones', 'nota', 'notas', 'porcentaje', 'ponderacion'],
  calendario: ['calendario', 'fecha', 'cuando', 'ciclo'],
  ruta: ['ruta', 'aprendizaje', 'unidad', 'semana'],
  guía: ['guia', 'guía', 'estudiante'],
  material: ['material', 'lectura', 'diapositiva', 'apoyo', 'contenido'],
  examen: ['examen', 'diferido', 'suficiencia', 'prueba'],
  agenda: ['agenda', 'tutor', 'tutoria', 'tutoría', 'sincrónica', 'sincronica'],
};

const COURSE_ALIASES: Record<string, string[]> = {
  tesis: ['tesis', 'seminario', 'ste135', 'investigacion'],
  gestion: ['gestion', 'gestión', 'proyectos', 'gps135', 'gps'],
  asesoria: ['asesoria', 'asesoría', 'profesional', 'apr135', 'apr', 'consultoria', 'consultoría'],
  auditoria: ['auditoria', 'auditoría', 'sistemas', 'asi135', 'asi'],
  desarrollo: ['desarrollo', 'reutilizacion', 'reutilización', 'drs135', 'drs', 'software'],
};

const MAX_PRELOAD_CHARS = 12_000;

export async function classifyIntent(message: string, _conversationHistory: string): Promise<ChatIntent> {
  const startedAt = Date.now();
  const allCourses = getCoursesWithMaterials();
  const normalized = message.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

  const course = matchCourse(normalized, allCourses);
  const keywords = matchKeywords(normalized);

  const intent = await buildIntent(course, keywords, allCourses);

  logActivity({
    category: 'chat',
    message: `Intent routed locally: course=${intent.courseId ?? 'none'}, keywords=${keywords.join(',')}, files=${intent.relevantFiles.length}, preloaded=${intent.preloadedContent.length}chars`,
    durationMs: Date.now() - startedAt,
  });

  return intent;
}

function matchCourse(normalized: string, allCourses: CourseWithMaterials[]): CourseWithMaterials | null {
  for (const course of allCourses) {
    const fullname = course.fullname.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const shortname = course.shortname.toLocaleLowerCase().replace(/_/g, '');
    if (fullname.length >= 4 && normalized.includes(fullname)) return course;
    if (shortname.length >= 3 && normalized.includes(shortname)) return course;
  }

  for (const [, aliases] of Object.entries(COURSE_ALIASES)) {
    const matchedAliases = aliases.filter(a => normalized.includes(a));
    if (matchedAliases.length > 0) {
      for (const course of allCourses) {
        const fullname = course.fullname.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
        const shortname = course.shortname.toLocaleLowerCase().replace(/_/g, '');
        if (matchedAliases.some(a => fullname.includes(a) || shortname.includes(a))) {
          return course;
        }
      }
    }
  }

  return null;
}

function matchKeywords(normalized: string): string[] {
  const matched: string[] = [];
  for (const [keyword, triggers] of Object.entries(KEYWORD_MAP)) {
    if (triggers.some(t => normalized.includes(t))) matched.push(keyword);
  }
  return matched;
}

async function buildIntent(
  course: CourseWithMaterials | null,
  keywords: string[],
  allCourses: CourseWithMaterials[],
): Promise<ChatIntent> {
  const relevantFiles: string[] = [];
  let directoryHint: string | null = null;
  let materialsContext = '';
  let preloadedContent = '';

  if (course) {
    directoryHint = getCourseMaterialsDirectory(course.id);

    const scored = course.materials
      .filter(m => m.localPath && existsSync(m.localPath))
      .map(m => {
        const name = (m.filename || m.name).toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
        let score = 0;
        for (const kw of keywords) {
          if (name.includes(kw.toLocaleLowerCase())) score += 10;
        }
        if (keywords.length === 0) {
          if (name.includes('orientacion')) score += 5;
          if (name.includes('ruta')) score += 3;
          if (name.includes('guia') || name.includes('guía')) score += 2;
        }
        return { ...m, score };
      })
      .sort((a, b) => b.score - a.score);

    const topFiles = scored.filter(m => m.score > 0).slice(0, 4);
    if (topFiles.length === 0 && scored.length > 0) {
      topFiles.push(...scored.slice(0, 2));
    }

    for (const f of topFiles) {
      if (f.localPath) relevantFiles.push(f.localPath);
    }

    preloadedContent = await preloadFiles(relevantFiles);

    materialsContext = `Curso identificado: ${course.fullname} (${course.shortname})\n`;
    materialsContext += `Directorio de materiales: ${directoryHint}\n`;
    if (topFiles.length > 0) {
      materialsContext += `Archivos encontrados:\n`;
      for (const f of topFiles) {
        materialsContext += `- ${f.sectionName}: ${f.filename || f.name}\n`;
      }
    }
  } else {
    materialsContext = 'No se identificó un curso específico. Cursos disponibles:\n';
    for (const c of allCourses) {
      materialsContext += `- ${c.fullname} (${c.shortname})\n`;
    }
  }

  return { courseId: course?.id ?? null, courseName: course?.fullname ?? null, relevantFiles, directoryHint, materialsContext, preloadedContent };
}

async function preloadFiles(paths: string[]): Promise<string> {
  let totalContent = '';
  let remaining = MAX_PRELOAD_CHARS;

  for (const filePath of paths) {
    if (remaining <= 0) break;
    try {
      let text = '';
      const ext = filePath.toLowerCase().split('.').pop();
      if (ext === 'pdf') {
        text = await extractTextFromPDF(filePath);
      } else if (ext === 'html' || ext === 'txt') {
        const raw = await readFile(filePath, 'utf-8');
        text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        continue;
      }

      if (text.length > remaining) text = text.slice(0, remaining) + '\n[...truncado]';
      const filename = filePath.split('/').pop() || filePath;
      totalContent += `\n--- CONTENIDO DE: ${filename} ---\n${text}\n`;
      remaining -= text.length;
    } catch {
      // skip unreadable files
    }
  }

  return totalContent;
}
