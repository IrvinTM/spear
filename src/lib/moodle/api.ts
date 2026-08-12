/**
 * Moodle Web Service API types and high-level fetch functions.
 * These map to Moodle's internal JSON API at /lib/ajax/service.php.
 */

import { SessionManager } from '@/lib/moodle/session';
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

/* ------------------------------------------------------------------ */
/*  Fetch Functions                                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Fetch Functions (Scraping Fallback)                               */
/* ------------------------------------------------------------------ */

/**
 * Fetch all enrolled courses for the current user.
 */
export async function fetchCourses(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCourse[]> {
  const res = await fetch(`${sm['baseUrl']}/my/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Cookie: session.moodleSessionCookie,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch dashboard: ${res.status}`);
  const html = await res.text();

  const courses: MoodleCourse[] = [];
  const regex = /<a\s+title="([^"]+)"\s+href="https:\/\/campus\.ues\.edu\.sv\/course\/view\.php\?id=(\d+)"[^>]*>.*?<\/i>\s*([^<]+)<\/a>/g;
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

  // Deduplicate
  const unique = Array.from(new Map(courses.map((c) => [c.id, c])).values());
  return unique;
}

/**
 * Fetch assignments for a list of course IDs.
 */
export async function fetchAssignments(
  sm: SessionManager,
  session: MoodleSession,
  courseIds: number[],
): Promise<{ courses: { id: number; assignments: MoodleAssignment[]; summary?: string }[] }> {
  const result = { courses: [] as { id: number; assignments: MoodleAssignment[]; summary?: string }[] };

  for (const courseId of courseIds) {
    const res = await fetch(`${sm['baseUrl']}/course/view.php?id=${courseId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Cookie: session.moodleSessionCookie,
      },
    });
    if (!res.ok) continue;
    const html = await res.text();

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
    
    // Extract course outline for summary
    const sections: string[] = [];
    const sectionRegex = /<li\s+class="nav-item[^>]*>\s*<a\s+class="nav-link[^>]*title="([^"]+)"/g;
    let secMatch;
    while ((secMatch = sectionRegex.exec(html)) !== null) {
      sections.push(secMatch[1].trim());
    }
    
    const materials: string[] = [];
    const matRegex = /<span class="instancename"[^>]*>([^<]+)/g;
    let matMatch;
    while ((matMatch = matRegex.exec(html)) !== null) {
      materials.push(matMatch[1].trim());
    }
    
    const summary = `Secciones: ${sections.join(', ')}\nMateriales: ${materials.join(', ')}`;
    result.courses.push({ id: courseId, assignments, summary });
  }

  return result;
}

export async function fetchCalendarEvents() { return []; }
export async function fetchCourseContents() { return []; }
