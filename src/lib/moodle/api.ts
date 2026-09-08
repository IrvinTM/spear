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

interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  categoryname?: string;
  visible: number;
  startdate: number;
  enddate: number;
}

interface MoodleAssignment {
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

interface MoodleCourseSection {
  id: number;
  name: string;
  visible: number;
  modules: { id: number; name: string; modname: string; visible: number; url?: string; contents?: MoodleModuleContent[] }[];
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
  const baseUrl = sm.getBaseUrl();
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

const SPANISH_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

function parseMoodleDateString(text: string): Date | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();
  const m = clean.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = SPANISH_MONTHS[m[2].toLowerCase()];
    const year = parseInt(m[3], 10);
    const hour = m[4] ? parseInt(m[4], 10) : 23;
    const min = m[5] ? parseInt(m[5], 10) : 59;
    if (month !== undefined) {
      const hStr = String(hour).padStart(2, '0');
      const minStr = String(min).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const moStr = String(month + 1).padStart(2, '0');
      // America/El_Salvador timezone is UTC-6
      return new Date(`${year}-${moStr}-${dStr}T${hStr}:${minStr}:00-06:00`);
    }
  }
  const parsed = Date.parse(text);
  if (!isNaN(parsed)) return new Date(parsed);
  return null;
}

function parseAssignmentPageHtml(html: string): {
  dueDate: Date | null;
  cutoffDate: Date | null;
  allowSubmissionsFromDate: Date | null;
  intro: string;
  submissionStatus: string | null;
  gradeStatus: string | null;
  timeRemaining: string | null;
} {
  let dueDate: Date | null = null;
  let cutoffDate: Date | null = null;
  let allowSubmissionsFromDate: Date | null = null;
  let submissionStatus: string | null = null;
  let gradeStatus: string | null = null;
  let timeRemaining: string | null = null;

  // 1. Activity dates section in Moodle 4.x theme (<strong>Apertura:</strong> ... <strong>Cierre:</strong> ...)
  const tagRegex = /<strong>(Apertura|Cierre|Fecha de entrega|Fecha l[íi]mite|Tiempo restante):?<\/strong>\s*([^<\n]+)/gi;
  let tm;
  while ((tm = tagRegex.exec(html)) !== null) {
    const label = tm[1].toLowerCase();
    const val = tm[2].trim();
    if (label.includes('cierre') || label.includes('límite') || label.includes('limite')) {
      cutoffDate = parseMoodleDateString(val);
    } else if (label.includes('entrega')) {
      dueDate = parseMoodleDateString(val);
    } else if (label.includes('apertura')) {
      allowSubmissionsFromDate = parseMoodleDateString(val);
    } else if (label.includes('tiempo')) {
      timeRemaining = val;
    }
  }

  // 2. Table rows in submission details: <tr><th ...>Label</th><td ...>Value</td></tr>
  const rowRegex = /<tr[^>]*>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let rm;
  while ((rm = rowRegex.exec(html)) !== null) {
    const th = rm[1].replace(/<[^>]*>/g, '').toLowerCase().trim();
    const td = rm[2].replace(/<[^>]*>/g, '').trim();
    if (th.includes('fecha de entrega')) {
      if (!dueDate) dueDate = parseMoodleDateString(td);
    } else if (th.includes('fecha límite') || th.includes('fecha limite')) {
      if (!cutoffDate) cutoffDate = parseMoodleDateString(td);
    } else if (th.includes('tiempo restante')) {
      if (!timeRemaining) timeRemaining = td;
    } else if (th.includes('estado de la entrega')) {
      submissionStatus = td;
    } else if (th.includes('calificación') || th.includes('calificacion')) {
      gradeStatus = td;
    }
  }

  // 3. Intro / description
  let intro = '';
  const introMatch = html.match(/<div[^>]+(?:id="intro"|class="activity-description")[^>]*>([\s\S]*?)<\/div>/i);
  if (introMatch) {
    intro = introMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return {
    dueDate: cutoffDate || dueDate,
    cutoffDate,
    allowSubmissionsFromDate,
    intro,
    submissionStatus,
    gradeStatus,
    timeRemaining,
  };
}

async function fetchAssignmentsScrape(
  sm: SessionManager,
  session: MoodleSession,
  courseIds: number[],
): Promise<CourseAssignmentResult> {
  const baseUrl = sm.getBaseUrl();
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

        let duedateSec = 0;
        let allowSubmissionsSec = 0;
        let introText = '';

        try {
          const assignHtml = await fetchPage(baseUrl, `/mod/assign/view.php?id=${id}`, session);
          const parsedDetails = parseAssignmentPageHtml(assignHtml);
          if (parsedDetails.dueDate) {
            duedateSec = Math.floor(parsedDetails.dueDate.getTime() / 1000);
          }
          if (parsedDetails.allowSubmissionsFromDate) {
            allowSubmissionsSec = Math.floor(parsedDetails.allowSubmissionsFromDate.getTime() / 1000);
          }
          introText = parsedDetails.intro || '';
        } catch (assignErr) {
          console.warn(`[Moodle] Could not scrape assignment ${id} details:`, assignErr);
        }

        assignments.push({
          id,
          cmid: id,
          course: courseId,
          name: assignmentMatch[2].replace(' Tarea', '').trim(),
          intro: introText,
          introformat: 1,
          duedate: duedateSec,
          allowsubmissionsfromdate: allowSubmissionsSec,
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
