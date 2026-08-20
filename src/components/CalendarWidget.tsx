'use client';

import { useState, useEffect } from 'react';

interface ClassData {
  summary: string;
  start: string;
  end: string;
  location?: string;
}

interface CalendarData {
  hasCalendar: boolean;
  ongoingClass?: ClassData | null;
  nextClass?: ClassData | null;
  error?: string;
}

export function CalendarWidget() {
  const [data, setData] = useState<CalendarData | null>(null);

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(setData)
      .catch(() => { });
  }, []);

  if (!data?.hasCalendar) return null;

  return (
    <>
      {/* Right Now Widget */}
      {data.ongoingClass && (
        <div className="bg-accent-600/20 border border-accent-500/30 rounded-xl p-4 shadow-sm animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-accent-500/10 rounded-bl-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-500"></span>
            </span>
            <h3 className="text-sm font-semibold text-accent-100">Right Now</h3>
          </div>

          <div className="relative z-10">
            <p className="text-sm font-medium text-stone-100">{data.ongoingClass.summary}</p>
            <p className="text-xs text-accent-200/70 mt-1">
              Ends at {new Date(data.ongoingClass.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {data.ongoingClass.location && (
              <p className="text-xs text-accent-200/70 mt-1">📍 {data.ongoingClass.location}</p>
            )}
          </div>
        </div>
      )}

      {/* Next Class Widget */}
      <div className="bg-stone-900 border border-white/[0.06] rounded-xl p-4 shadow-sm animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">📅</span>
          <h3 className="text-sm font-semibold text-stone-200">Next Event</h3>
        </div>

        {data.error ? (
          <p className="text-xs text-danger">{data.error}</p>
        ) : data.nextClass ? (
          <div>
            <p className="text-sm font-medium text-stone-200">{data.nextClass.summary}</p>
            <p className="text-xs text-stone-400 mt-1">
              {new Date(data.nextClass.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(data.nextClass.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {data.nextClass.location && (
              <p className="text-xs text-stone-500 mt-1">📍 {data.nextClass.location}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-stone-500">No upcoming events scheduled.</p>
        )}
      </div>
    </>
  );
}
