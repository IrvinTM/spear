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
    // We want the next upcoming event that hasn't finished yet
    // Or hasn't started yet. Let's find events that end in the future, sort by start time.
    const upcomingEvents = Object.values(events)
      .filter((e: any) => e && e.type === 'VEVENT')
      .map((e: any) => ({
        summary: e.summary,
        start: new Date(e.start),
        end: new Date(e.end),
        location: e.location
      }))
      .filter(e => e.end > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (upcomingEvents.length === 0) {
      return NextResponse.json({ hasCalendar: true, nextClass: null });
    }

    return NextResponse.json({
      hasCalendar: true,
      nextClass: {
        summary: upcomingEvents[0].summary,
        start: upcomingEvents[0].start.toISOString(),
        end: upcomingEvents[0].end.toISOString(),
        location: upcomingEvents[0].location
      }
    });
  } catch (error) {
    console.error('Calendar API Error:', error);
    return NextResponse.json({ hasCalendar: true, error: 'Failed to fetch calendar' });
  }
}
