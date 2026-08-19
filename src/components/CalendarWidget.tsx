'use client';

import { useState, useEffect } from 'react';

interface CalendarData {
  hasCalendar: boolean;
  nextClass?: {
    summary: string;
    start: string;
    end: string;
    location?: string;
  } | null;
  error?: string;
}

export function CalendarWidget() {
  const [data, setData] = useState<CalendarData | null>(null);

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data?.hasCalendar) return null;

  return (
    <div className="bg-stone-900 border border-white/[0.06] rounded-xl p-4 shadow-sm animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">📅</span>
        <h3 className="text-sm font-semibold text-stone-200">Next Class</h3>
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
        <p className="text-xs text-stone-500">No upcoming classes scheduled.</p>
      )}
    </div>
  );
}
