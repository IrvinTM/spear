/**
 * Moodle API — fetch functions with WS JSON API primary, HTML scraping fallback.
 * The UES Moodle instance may have Web Services disabled, so we try the
 * JSON API first and fall back to scraping if it fails.
 */

import { SessionManager, MoodleApiError } from '@/lib/moodle/session';
import type { MoodleSession } from '@/lib/moodle/session';
import { logActivity } from '@/lib/activity-log';

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
  sectionId?: number;
  sectionName?: string;
  sectionPosition?: number;
  visible?: number;
  description?: string;
  contents: MoodleModuleContent[];
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

    const materials: ExtractedMaterial[] = [];

    for (let sectionPosition = 0; sectionPosition < sections.length; sectionPosition++) {
      const section = sections[sectionPosition];
      for (const mod of section.modules) {
        materials.push({
          id: mod.id,
          type: mod.modname,
          name: mod.name,
          url: mod.url || '',
          sectionId: section.id,
          sectionName: section.name || `Sección ${sectionPosition + 1}`,
          sectionPosition,
          visible: mod.visible,
          contents: mod.contents || [],
        });
      }
    }

    const sectionNames = sections.map((section) => section.name).filter(Boolean);
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
  return sm.getBaseUrl();
}

async function fetchPage(baseUrl: string, path: string, session: MoodleSession): Promise<string> {
  const url = new URL(path, baseUrl).toString();
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Cookie: session.moodleSessionCookie,
      },
    });
    logActivity({ category: 'moodle_api', level: res.ok ? 'info' : 'error', message: 'Fetched Moodle course page', method: 'GET', url, statusCode: res.status, durationMs: Date.now() - startedAt });
    if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
    return res.text();
  } catch (error) {
    logActivity({ category: 'moodle_api', level: 'error', message: error instanceof Error ? error.message : 'Moodle course page request failed', method: 'GET', url, durationMs: Date.now() - startedAt });
    throw error;
  }
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
    let courseHtml: string;
    try {
      courseHtml = await fetchPage(baseUrl, `/course/view.php?id=${courseId}`, session);
    } catch {
      continue;
    }

    // The UES tabbed course format only renders the selected unit/week. The
    // initial page contains navigation links, so crawl each distinct section
    // page rather than treating the first page as the complete course.
    const sectionMap = new Map(extractCourseSectionLinks(courseHtml, baseUrl, courseId).map((section) => [section.number, section.name]));
    const pages = [{ html: courseHtml, sectionName: 'Contenido del curso', sectionPosition: 0 }];
    const queuedSections = [...sectionMap.keys()];
    const fetchedSections = new Set<number>();
    for (let index = 0; index < queuedSections.length; index++) {
      const number = queuedSections[index];
      if (fetchedSections.has(number)) continue;
      fetchedSections.add(number);
      try {
        const html = await fetchPage(baseUrl, `/course/view.php?id=${courseId}&section=${number}`, session);
        pages.push({
          html,
          sectionName: sectionMap.get(number) || `Sección ${number}`,
          sectionPosition: number,
        });
        for (const discovered of extractCourseSectionLinks(html, baseUrl, courseId)) {
          if (!sectionMap.has(discovered.number)) {
            sectionMap.set(discovered.number, discovered.name);
            queuedSections.push(discovered.number);
          }
        }
      } catch (error) {
        console.warn(`[Moodle] Unable to fetch course ${courseId} section ${number}`, error);
      }
    }

    const assignments: MoodleAssignment[] = [];
    const materials: ExtractedMaterial[] = [];
    const seenAssignments = new Set<number>();
    const seenMaterials = new Set<number>();

    for (const page of pages) {
      const assignRegex = /href="[^"]*?\/mod\/assign\/view\.php\?id=(\d+)[^"]*"[^>]*>[\s\S]*?<span\s+class="instancename"[^>]*>([^<]+)/g;
      let assignmentMatch;
      while ((assignmentMatch = assignRegex.exec(page.html)) !== null) {
        const id = parseInt(assignmentMatch[1], 10);
        if (seenAssignments.has(id)) continue;
        seenAssignments.add(id);
        assignments.push({
          id,
          cmid: id,
          course: courseId,
          name: assignmentMatch[2].replace(' Tarea', '').trim(),
          intro: '',
          introformat: 1,
          duedate: 0,
          allowsubmissionsfromdate: 0,
          grade: 10,
        });
      }

      const matRegex = /<a[^>]*href="([^"]*?\/mod\/([^/]+)\/view\.php\?id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      let materialMatch;
      while ((materialMatch = matRegex.exec(page.html)) !== null) {
        const type = materialMatch[2];
        const id = parseInt(materialMatch[3], 10);
        const nameMatch = /<span\s+class="instancename"[^>]*>([^<]+)/.exec(materialMatch[4]);
        if (!nameMatch || seenMaterials.has(id)) continue;
        seenMaterials.add(id);
        materials.push({
          id,
          type,
          name: nameMatch[1].replace(' Tarea', '').trim(),
          url: new URL(materialMatch[1].replace(/&amp;/g, '&'), baseUrl).toString(),
          sectionName: page.sectionName,
          sectionPosition: page.sectionPosition,
          visible: 1,
          contents: [],
        });
      }
    }

    const summary = `Secciones: ${[...sectionMap.entries()].sort(([a], [b]) => a - b).map(([, name]) => name).join(', ')}\nMateriales: ${materials.map((material) => material.name).join(', ')}`;
    result.courses.push({ id: courseId, assignments, materials, summary });
  }

  return result;
}

function extractCourseSectionLinks(
  html: string,
  baseUrl: string,
  courseId: number,
): Array<{ number: number; name: string }> {
  const sections = new Map<number, string>();
  const linkRegex = /<a\b[^>]*href="([^"]*course\/view\.php\?[^"#]*\bsection=(\d+)[^"]*)"[^>]*?(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = new URL(match[1].replace(/&amp;/g, '&'), baseUrl);
    if (url.searchParams.get('id') !== String(courseId)) continue;
    const number = parseInt(match[2], 10);
    const title = match[3] || stripHtml(match[4]);
    const name = title.replace(/\s*:\s*Ocultado a los estudiantes\s*$/i, '').trim() || `Sección ${number}`;
    sections.set(number, name);
  }
  return [...sections.entries()]
    .map(([number, name]) => ({ number, name }))
    .sort((a, b) => a.number - b.number);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
