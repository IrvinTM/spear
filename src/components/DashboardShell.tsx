'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotChat } from '@/components/CopilotChat';
import { SyncBriefing } from '@/components/SyncBriefing';
import { EmailBriefing } from '@/components/EmailBriefing';
import { CalendarWidget } from '@/components/CalendarWidget';
import { ActiveHomeworksWidget } from '@/components/ActiveHomeworksWidget';
import { WhatRequiresYourAttentionWidget } from '@/components/WhatRequiresYourAttentionWidget';
import { LiveActivity } from '@/components/LiveActivity';
import { playSyncStartCue, playSyncDoneCue, playErrorCue } from '@/lib/client/audio-cues';
import { Radio, X, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import { useSidebar } from '@/components/SidebarContext';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const { collapsed } = useSidebar();

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

  const pathname = usePathname();
  const isTodoTab = pathname === '/';

  return (
    <>
      {/* Mobile Flow for Todo Tab: Attention and Briefings in document scroll */}
      {isTodoTab && (
        <div className="md:hidden w-full flex flex-col gap-4 mb-6">
          <WhatRequiresYourAttentionWidget />
          <CalendarWidget />
          <ActiveHomeworksWidget />
          <SyncBriefing expanded={briefingExpanded} />
          <EmailBriefing expanded={briefingExpanded} />
          <button
            onClick={() => setBriefingExpanded((v) => !v)}
            className="self-end text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer px-1 -mt-1"
          >
            {briefingExpanded ? 'Collapse briefings' : 'Expand briefings'}
          </button>
        </div>
      )}

      {children}

      {/* Desktop: What Requires Your Attention Widget (Centered, pinned at top) */}
      {isTodoTab && (
        <div className={`hidden md:flex fixed top-4 z-30 transition-all duration-300 pointer-events-none justify-center ${
          collapsed ? 'left-0 right-0' : 'left-60 right-0'
        } px-4`}>
          <div className="pointer-events-auto w-full max-w-2xl xl:max-w-3xl max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
            <WhatRequiresYourAttentionWidget />
          </div>
        </div>
      )}

      {/* Desktop Left side: Briefing panels (Only visible on Todo tab) */}
      {isTodoTab && (
        <div className={`hidden md:block fixed bottom-20 z-30 w-[300px] transition-all duration-300 max-lg:left-6 max-lg:w-[280px] ${collapsed ? 'left-6' : 'left-[calc(15rem+1.5rem)]'}`}>
          <div className="flex flex-col gap-2">
            <CalendarWidget />
            <ActiveHomeworksWidget />
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
      )}

      {/* Desktop Right side: Chat panel */}
      <div
        className={`hidden md:block fixed bottom-20 right-6 z-40 w-[380px] max-lg:w-[320px] transition-all duration-300 ${
          chatExpanded ? 'h-[500px]' : 'h-auto'
        }`}
      >
        <div className={`cyber-glass rounded-xl shadow-2xl overflow-hidden flex flex-col ${chatExpanded ? 'h-full' : ''}`}>
          {/* Expand toggle */}
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-accent-500/10 bg-stone-950/40">
            <button
              onClick={() => setChatExpanded((v) => !v)}
              className="text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer flex items-center gap-1"
            >
              {chatExpanded ? <><ChevronDown className="w-3.5 h-3.5" /> Collapse</> : <><ChevronUp className="w-3.5 h-3.5" /> Expand chat</>}
            </button>
          </div>
          <div className={chatExpanded ? 'flex-1 min-h-0' : ''}>
            <CopilotChat expanded={chatExpanded} />
          </div>
        </div>
      </div>

      {/* Desktop Activity floating panel */}
      {isTodoTab && (
        <>
          <div
            className={`hidden md:block fixed bottom-20 right-[calc(380px+3rem)] z-40 w-[400px] max-lg:right-6 max-lg:bottom-[calc(4rem+60px)] cyber-glass rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${
              activityOpen
                ? 'opacity-100 pointer-events-auto translate-y-0 scale-100'
                : 'opacity-0 pointer-events-none translate-y-4 scale-95'
            }`}
            style={{ height: '350px' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-accent-500/10 bg-stone-950/60">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-stone-100">Activity</h3>
              </div>
              <button
                onClick={() => setActivityOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-stone-500 hover:text-stone-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Cerrar actividad"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-[calc(100%-48px)]">
              <LiveActivity onSyncEvent={handleSyncEvent} />
            </div>
          </div>

          {/* Desktop Activity FAB */}
          <button
            onClick={() => setActivityOpen((v) => !v)}
            className={`hidden md:flex fixed bottom-6 right-[calc(380px+3rem)] max-lg:right-6 max-lg:bottom-[calc(4rem+60px)] z-50 w-10 h-10 rounded-full items-center justify-center text-lg shadow-lg border transition-all cursor-pointer hover:-translate-y-0.5 ${
              activityOpen
                ? 'bg-pale-700 border-pale-600 shadow-[0_0_15px_rgba(166,172,205,0.15)]'
                : 'bg-stone-950/60 backdrop-blur-xl border-pale-700/40 hover:bg-pale-800/60 hover:border-pale-500/40 hover:shadow-[0_0_12px_rgba(166,172,205,0.1)]'
            } ${activityOpen ? 'opacity-0 pointer-events-none' : ''}`}
            title="Activity"
          >
            <Radio className="w-4 h-4 text-pale-300" />
          </button>
        </>
      )}

      {/* Mobile Floating Action Buttons (FABs) */}
      <div className="fixed bottom-28 right-4 z-40 flex flex-col items-center gap-2.5 md:hidden">
        {isTodoTab && (
          <button
            onClick={() => setActivityOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-stone-900/90 border border-pale-700/40 text-pale-300 shadow-lg backdrop-blur-md active:scale-95 transition-transform"
            title="Activity"
          >
            <Radio className="w-4 h-4 text-emerald-400" />
          </button>
        )}
        <button
          onClick={() => setMobileChatOpen(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-pale-800 border border-pale-500/50 text-pale-200 shadow-xl backdrop-blur-md active:scale-95 transition-transform"
          title="Copilot Chat"
        >
          <Bot className="w-5 h-5 text-pale-300" />
        </button>
      </div>

      {/* Mobile Copilot Chat Bottom Sheet */}
      {mobileChatOpen && (
        <div className="fixed inset-x-3 bottom-20 top-16 z-50 cyber-glass rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-pale-700/40 md:hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-accent-500/10 bg-stone-950/80">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-pale-300" />
              <h3 className="text-sm font-semibold text-stone-100">Campus Copilot</h3>
            </div>
            <button
              onClick={() => setMobileChatOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-stone-400 hover:text-white transition-colors"
              title="Cerrar chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-stone-950/40">
            <CopilotChat expanded={true} />
          </div>
        </div>
      )}

      {/* Mobile Activity Bottom Sheet */}
      {activityOpen && (
        <div className="fixed inset-x-3 bottom-20 top-16 z-50 cyber-glass rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-pale-700/40 md:hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-accent-500/10 bg-stone-950/80">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-stone-100">Live Activity</h3>
            </div>
            <button
              onClick={() => setActivityOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-stone-400 hover:text-white transition-colors"
              title="Cerrar actividad"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LiveActivity onSyncEvent={handleSyncEvent} />
          </div>
        </div>
      )}
    </>
  );
}
