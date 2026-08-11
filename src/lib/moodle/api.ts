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

/**
 * Fetch all enrolled courses for the current user.
 */
export async function fetchCourses(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCourse[]> {
  return sm.callApi<MoodleCourse[]>(session, 'core_enrol_get_users_courses', {
    userid: session.userId,
  });
}

/**
 * Fetch assignments for a list of course IDs.
 */
export async function fetchAssignments(
  sm: SessionManager,
  session: MoodleSession,
  courseIds: number[],
): Promise<{ courses: { id: number; assignments: MoodleAssignment[] }[] }> {
  return sm.callApi<{ courses: { id: number; assignments: MoodleAssignment[] }[] }>(
    session,
    'mod_assign_get_assignments',
    { courseids: courseIds },
  );
}

/**
 * Fetch upcoming calendar events (next 30 days).
 */
export async function fetchCalendarEvents(
  sm: SessionManager,
  session: MoodleSession,
): Promise<MoodleCalendarEvent[]> {
  const timesortfrom = Math.floor(Date.now() / 1000);
  const timesortto = timesortfrom + 30 * 24 * 3600;

  const result = await sm.callApi<{ events: MoodleCalendarEvent[] }>(
    session,
    'core_calendar_get_action_events_by_timesort',
    { timesortfrom, timesortto, limitnum: 100 },
  );

  return result.events;
}

/**
 * Fetch course contents (sections with modules and files).
 */
export async function fetchCourseContents(
  sm: SessionManager,
  session: MoodleSession,
  courseId: number,
): Promise<MoodleCourseSection[]> {
  return sm.callApi<MoodleCourseSection[]>(session, 'core_course_get_contents', {
    courseid: courseId,
  });
}
