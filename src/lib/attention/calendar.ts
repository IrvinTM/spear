/**
 * Academic calendar for Ciclo II-2026 (UES).
 *
 * Single source of truth for "what week are we in?".
 * Anchor: Week 5 = Mon Sep 7 → Sun Sep 13, 2026 (America/El_Salvador).
 * Therefore Week 1 starts Mon Aug 10, 2026.
 *
 * Pure module — no node deps so it can be imported from client components.
 */

export const SEMESTER_WEEK1_START_ISO = '2026-08-10T00:00:00-06:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function getWeek1Start(): Date {
  return new Date(SEMESTER_WEEK1_START_ISO);
}

/**
 * Academic week number (1-based) for a given date.
 * Dates before Week 1 yield 0 / negative numbers.
 */
export function getAcademicWeekForDate(d: Date): number {
  const diffMs = d.getTime() - getWeek1Start().getTime();
  if (diffMs < 0) {
    return Math.floor(diffMs / WEEK_MS) + 1;
  }
  return Math.floor(diffMs / WEEK_MS) + 1;
}

/** Monday 00:00 → Sunday 23:59:59 of a given academic week. */
export function getWeekRange(week: number): { start: Date; end: Date } {
  const anchor = getWeek1Start().getTime();
  const start = new Date(anchor + (week - 1) * WEEK_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS + (23 * 3600 + 59 * 60 + 59) * 1000);
  return { start, end };
}

const dayFmt = new Intl.DateTimeFormat('es-SV', {
  day: '2-digit',
  timeZone: 'America/El_Salvador',
});
const monthFmt = new Intl.DateTimeFormat('es-SV', {
  month: 'long',
  timeZone: 'America/El_Salvador',
});
const yearFmt = new Intl.DateTimeFormat('es-SV', {
  year: 'numeric',
  timeZone: 'America/El_Salvador',
});
const fullDateFmt = new Intl.DateTimeFormat('es-SV', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/El_Salvador',
});

export function formatWeekLabel(week: number, start: Date, end: Date): string {
  const startMonth = monthFmt.format(start);
  const endMonth = monthFmt.format(end);
  const endYear = yearFmt.format(end);
  const startDay = dayFmt.format(start);
  const endDay = dayFmt.format(end);

  if (startMonth === endMonth) {
    return `Semana ${week} (Del ${startDay} al ${endDay} de ${endMonth} de ${endYear})`;
  }
  return `Semana ${week} (Del ${startDay} de ${startMonth} al ${endDay} de ${endMonth} de ${endYear})`;
}

export function getCurrentAcademicWeek(now: Date = new Date()): {
  week: number;
  label: string;
  start: Date;
  end: Date;
} {
  const week = getAcademicWeekForDate(now);
  const { start, end } = getWeekRange(week);
  return { week, label: formatWeekLabel(week, start, end), start, end };
}

export function formatCurrentDateEs(now: Date = new Date()): string {
  return fullDateFmt.format(now);
}
