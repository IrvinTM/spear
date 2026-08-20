import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import ical from 'node-ical';

export async function GET() {
  try {
    const settings = getSettings();
    if (!settings.calendarUrl) {
      return NextResponse.json({ hasCalendar: false });
    }

    // Fetch and parse the ICS file
    const events = await ical.async.fromURL(settings.calendarUrl);
    
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    let upcomingEvents: any[] = [];

    Object.values(events).forEach((e: any) => {
      if (e && e.type === 'VEVENT') {
        // Ignore all-day events (like birthdays or reminders)
        if (e.start && e.start.dateOnly) {
          return;
        }

        const summary = e.summary || '';

        let duration = e.end ? e.end.getTime() - e.start.getTime() : 60 * 60 * 1000;
        
        // Fix for erroneous ICS exports where the end date is off by multiple days
        if (duration > 24 * 60 * 60 * 1000) {
          duration = duration % (24 * 60 * 60 * 1000);
          if (duration === 0) duration = 60 * 60 * 1000; // fallback to 1 hour
        }

        if (e.rrule) {
          // Get occurrences from slightly before 'now' to ensure ongoing events are caught
          const dates = e.rrule.between(new Date(now.getTime() - duration - 1000), nextWeek);
          dates.forEach((date: any) => {
            upcomingEvents.push({
              summary: summary,
              start: new Date(date),
              end: new Date(date.getTime() + duration),
              location: e.location || ''
            });
          });
        } else {
          upcomingEvents.push({
            summary: summary,
            start: new Date(e.start),
            end: new Date(e.end ? e.start.getTime() + duration : e.start.getTime() + duration),
            location: e.location || ''
          });
        }
      }
    });

    upcomingEvents = upcomingEvents
      .filter((e: any) => e.end > now)
      .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

    let ongoingClass = null;
    let nextClass = null;

    for (const e of upcomingEvents) {
      if (e.start <= now && e.end > now) {
        if (!ongoingClass) ongoingClass = e;
      } else if (e.start > now) {
        if (!nextClass) nextClass = e;
      }
      if (ongoingClass && nextClass) break;
    }

    if (!ongoingClass && !nextClass) {
      return NextResponse.json({ hasCalendar: true, ongoingClass: null, nextClass: null });
    }

    return NextResponse.json({
      hasCalendar: true,
      ongoingClass: ongoingClass ? {
        summary: ongoingClass.summary,
        start: ongoingClass.start.toISOString(),
        end: ongoingClass.end.toISOString(),
        location: ongoingClass.location
      } : null,
      nextClass: nextClass ? {
        summary: nextClass.summary,
        start: nextClass.start.toISOString(),
        end: nextClass.end.toISOString(),
        location: nextClass.location
      } : null
    });
  } catch (error) {
    console.error('Calendar API Error:', error);
    return NextResponse.json({ hasCalendar: true, error: 'Failed to fetch calendar' });
  }
}
