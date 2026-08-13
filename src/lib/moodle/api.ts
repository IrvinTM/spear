/**
 * Moodle API — fetch functions with WS JSON API primary, HTML scraping fallback.
 * The UES Moodle instance may have Web Services disabled, so we try the
 * JSON API first and fall back to scraping if it fails.
 */

import { SessionManager, MoodleApiError } from '@/lib/moodle/session';
import type { MoodleSession } from '@/lib/moodle/session';

/* ------------------------------------------------------------------ */
/*  API Response Types                                                */
/* ------------------------------------------------------------------ */

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  categoryname?: string;
  visible: number;
  startdate: number;
  enddate: number;
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  intro: string;
  introformat: number;
  duedate: number;
  allowsubmissionsfromdate: number;
  grade: number;
  introattachments?: MoodleAttachment[];
}

export interface ExtractedMaterial {
  id: number;
  type: string;
  name: string;
  url: string;
}

export interface MoodleAttachment {
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype: string;
}

export interface MoodleCalendarEvent {
  id: number;
  name: string;
  description: string;
  courseid: number;
  timestart: number;
  timeduration: number;
  eventtype: string;
  url: string;
  modulename?: string;
  instance?: number;
}

export interface MoodleCourseSection {
  id: number;
  name: string;
  visible: number;
  modules: MoodleCourseModule[];
}

export interface MoodleCourseModule {
  id: number;
  name: string;
  modname: string;
  visible: number;
  url?: string;
  contents?: MoodleModuleContent[];
}

export interface MoodleModuleContent {
  type: string;
  filename: string;
  fileurl: string;
  filesize: number;
  mimetype?: string;
}

type CourseAssignmentResult = {
  courses: {
    id: number;
    assignments: MoodleAssignment[];
    materials: ExtractedMaterial[];
    summary?: string;
  }[];
};

/* ------------------------------------------------------------------ */
/*  Public API — tries WS first, falls back to scraping               */
/* ------------------------------------------------------------------ */

export async function fetchCourses(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCourse[]> {
  try {
    return await fetchCoursesWs(sm, session);
  } catch (err) {
    if (err instanceof MoodleApiError) {
      console.warn('[Moodle] WS API unavailable for courses, falling back to scraping');
      return fetchCoursesScrape(sm, session);
    }
    throw err;
  }
}

export async function fetchAssignments(
  sm: SessionManager,
  session: MoodleSession,
  courseIds: number[],
): Promise<CourseAssignmentResult> {
  try {
    return await fetchAssignmentsWs(sm, session, courseIds);
  } catch (err) {
    if (err instanceof MoodleApiError) {
      console.warn('[Moodle] WS API unavailable for assignments, falling back to scraping');
      return fetchAssignmentsScrape(sm, session, courseIds);
    }
    throw err;
  }
}

export async function fetchCalendarEvents(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCalendarEvent[]> {
  try {
    const response = await sm.callApi<{ events: MoodleCalendarEvent[] }>(
      session,
      'core_calendar_get_calendar_upcoming_view',
      {},
    );
    return response.events;
  } catch {
    return [];
  }
}

export async function fetchCourseContents(
  sm: SessionManager,
  session: MoodleSession,
  courseId: number,
): Promise<MoodleCourseSection[]> {
  return sm.callApi<MoodleCourseSection[]>(
    session,
    'core_course_get_contents',
    { courseid: courseId },
  );
}

/* ------------------------------------------------------------------ */
/*  WS JSON API implementations                                      */
/* ------------------------------------------------------------------ */

async function fetchCoursesWs(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCourse[]> {
  return sm.callApi<MoodleCourse[]>(
    session,
    'core_enrol_get_users_courses',
    { userid: session.userId },
  );
}

async function fetchAssignmentsWs(
  sm: SessionManager,
  session: MoodleSession,
  courseIds: number[],
): Promise<CourseAssignmentResult> {
  const assignResponse = await sm.callApi<{ courses: { id: number; assignments: MoodleAssignment[] }[] }>(
    session,
    'mod_assign_get_assignments',
    { courseids: courseIds },
  );

  const result: CourseAssignmentResult = { courses: [] };

  for (const courseData of assignResponse.courses) {
    let sections: MoodleCourseSection[] = [];
    try {
      sections = await sm.callApi<MoodleCourseSection[]>(
        session,
        'core_course_get_contents',
        { courseid: courseData.id },
      );
    } catch {}

    const sectionNames: string[] = [];
    const materials: ExtractedMaterial[] = [];

    for (const section of sections) {
      if (section.name) sectionNames.push(section.name);
      for (const mod of section.modules) {
        materials.push({
          id: mod.id,
          type: mod.modname,
          name: mod.name,
          url: mod.url || '',
        });
      }
    }

    const materialNames = materials.map((m) => m.name);
    const summary = `Secciones: ${sectionNames.join(', ')}\nMateriales: ${materialNames.join(', ')}`;

    result.courses.push({
      id: courseData.id,
      assignments: courseData.assignments,
      materials,
      summary,
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  HTML Scraping fallback                                            */
/* ------------------------------------------------------------------ */

function getBaseUrl(sm: SessionManager): string {
  return (sm as any).baseUrl as string;
}

async function fetchPage(baseUrl: string, path: string, session: MoodleSession): Promise<string> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Cookie: session.moodleSessionCookie,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.text();
}

async function fetchCoursesScrape(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCourse[]> {
  const baseUrl = getBaseUrl(sm);
  const html = await fetchPage(baseUrl, '/my/', session);

  const courses: MoodleCourse[] = [];
  const regex = new RegExp(
    `<a\\s+title="([^"]+)"\\s+href="${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/course\\/view\\.php\\?id=(\\d+)"[^>]*>.*?<\\/i>\\s*([^<]+)<\\/a>`,
    'g',
  );
  let match;
  while ((match = regex.exec(html)) !== null) {
    courses.push({
      id: parseInt(match[2], 10),
      shortname: match[1],
      fullname: match[3].trim(),
      visible: 1,
      startdate: 0,
      enddate: 0,
    });
  }

  return Array.from(new Map(courses.map((c) => [c.id, c])).values());
}

async function fetchAssignmentsScrape(
  sm: SessionManager,
  session: MoodleSession,
  courseIds: number[],
): Promise<CourseAssignmentResult> {
  const baseUrl = getBaseUrl(sm);
  const result: CourseAssignmentResult = { courses: [] };

  for (const courseId of courseIds) {
    let html: string;
    try {
      html = await fetchPage(baseUrl, `/course/view.php?id=${courseId}`, session);
    } catch {
      continue;
    }

    const assignments: MoodleAssignment[] = [];
    const assignRegex = /href="[^"]*?\/mod\/assign\/view\.php\?id=(\d+)"[^>]*>.*?<span\s+class="instancename"[^>]*>([^<]+)/g;
    let match;
    while ((match = assignRegex.exec(html)) !== null) {
      assignments.push({
        id: parseInt(match[1], 10),
        cmid: parseInt(match[1], 10),
        course: courseId,
        name: match[2].replace(' Tarea', '').trim(),
        intro: '',
        introformat: 1,
        duedate: 0,
        allowsubmissionsfromdate: 0,
        grade: 10,
      });
    }

    const sections: string[] = [];
    const sectionRegex = /<li\s+class="nav-item[^>]*>\s*<a\s+class="nav-link[^>]*title="([^"]+)"/g;
    let secMatch;
    while ((secMatch = sectionRegex.exec(html)) !== null) {
      sections.push(secMatch[1].trim());
    }

    const materials: ExtractedMaterial[] = [];
    const materialsNames: string[] = [];
    const matRegex = /<a[^>]*href="[^"]*?\/mod\/([^/]+)\/view\.php\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let matMatch;
    while ((matMatch = matRegex.exec(html)) !== null) {
      const type = matMatch[1];
      const id = parseInt(matMatch[2], 10);
      const innerHtml = matMatch[3];
      const nameMatch = /<span\s+class="instancename"[^>]*>([^<]+)/.exec(innerHtml);
      if (nameMatch) {
        const name = nameMatch[1].replace(' Tarea', '').trim();
        materials.push({ id, type, name, url: `${baseUrl}/mod/${type}/view.php?id=${id}` });
        materialsNames.push(name);
      }
    }

    const summary = `Secciones: ${sections.join(', ')}\nMateriales: ${materialsNames.join(', ')}`;
    result.courses.push({ id: courseId, assignments, materials, summary });
  }

  return result;
}
