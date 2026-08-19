'use client';

import { useState, useCallback } from 'react';
import { CopilotChat } from '@/components/CopilotChat';
import { SyncBriefing } from '@/components/SyncBriefing';
import { EmailBriefing } from '@/components/EmailBriefing';
import { CalendarWidget } from '@/components/CalendarWidget';
import { LiveActivity } from '@/components/LiveActivity';
import { playSyncStartCue, playSyncDoneCue, playErrorCue } from '@/lib/client/audio-cues';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const handleSyncEvent = useCallback((type: 'started' | 'completed' | 'failed') => {
    if (type === 'started') {
      setActivityOpen(true);
      playSyncStartCue();
    } else if (type === 'completed') {
      playSyncDoneCue();
    } else {
      playErrorCue();
    }
  }, []);

  return (
    <>
      {children}

      {/* Left side: Briefing panels */}
      <div className="fixed bottom-20 left-[calc(15rem+1.5rem)] z-40 w-[300px] max-lg:left-6 max-lg:w-[280px]">
        <div className="flex flex-col gap-2">
          <CalendarWidget />
          <SyncBriefing expanded={briefingExpanded} />
          <EmailBriefing expanded={briefingExpanded} />
          <button
            onClick={() => setBriefingExpanded((v) => !v)}
            className="self-end text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer px-1"
          >
            {briefingExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Right side: Chat panel */}
      <div
        className={`fixed bottom-20 right-6 z-40 w-[380px] max-lg:w-[320px] transition-all duration-300 ${
          chatExpanded ? 'h-[500px]' : 'h-auto'
        }`}
      >
        <div className={`bg-stone-900 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden flex flex-col ${chatExpanded ? 'h-full' : ''}`}>
          {/* Expand toggle */}
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-white/[0.06] bg-stone-950/40">
            <button
              onClick={() => setChatExpanded((v) => !v)}
              className="text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              {chatExpanded ? '▼ Collapse' : '▲ Expand chat'}
            </button>
          </div>
          <div className={chatExpanded ? 'flex-1 min-h-0' : ''}>
            <CopilotChat expanded={chatExpanded} />
          </div>
        </div>
      </div>

      {/* Activity floating panel */}
      <div
        className={`fixed bottom-20 right-[calc(380px+3rem)] z-40 w-[400px] max-lg:right-6 max-lg:bottom-[calc(4rem+60px)] rounded-xl border border-white/[0.08] bg-stone-900 shadow-2xl overflow-hidden transition-all duration-300 ${
          activityOpen
            ? 'opacity-100 pointer-events-auto translate-y-0 scale-100'
            : 'opacity-0 pointer-events-none translate-y-4 scale-95'
        }`}
        style={{ height: '350px' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-stone-950/60">
          <div className="flex items-center gap-2">
            <span>📡</span>
            <h3 className="text-sm font-semibold text-stone-200">Activity</h3>
          </div>
          <button
            onClick={() => setActivityOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-stone-500 hover:text-stone-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="h-[calc(100%-48px)]">
          <LiveActivity onSyncEvent={handleSyncEvent} />
        </div>
      </div>

      {/* Activity FAB */}
      <button
        onClick={() => setActivityOpen((v) => !v)}
        className={`fixed bottom-6 right-[calc(380px+3rem)] max-lg:right-6 max-lg:bottom-[calc(4rem+60px)] z-50 w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg border transition-all cursor-pointer hover:-translate-y-0.5 ${
          activityOpen
            ? 'bg-accent-600 border-accent-700 shadow-glow'
            : 'bg-stone-800 border-white/[0.08] hover:bg-stone-700'
        } ${activityOpen ? 'opacity-0 pointer-events-none' : ''}`}
        title="Activity"
      >
        📡
      </button>
    </>
  );
}
