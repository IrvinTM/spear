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
import { CharacterViewer } from '@/components/CharacterViewer';
import { useCharacterConfig, usePersistentBoolean } from '@/components/CharacterConfigContext';
import { playSyncStartCue, playSyncDoneCue, playErrorCue } from '@/lib/client/audio-cues';
import { Radio, X, ChevronDown, ChevronUp, Bot, Eye, EyeOff, SlidersHorizontal } from 'lucide-react';

function RestorePill({ label, onShow }: { label: string; onShow: () => void }) {
  return (
    <button
      onClick={onShow}
      className="w-full flex items-center justify-between px-3 py-2 cyber-glass rounded-xl text-xs text-stone-400 hover:text-stone-100 transition-colors cursor-pointer pointer-events-auto relative z-20"
      title={`Mostrar ${label}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-stone-600 shrink-0" />
        <span className="truncate">{label} (oculto)</span>
      </span>
      <span className="inline-flex items-center gap-1 text-accent-400 font-medium shrink-0 ml-2">
        <Eye className="w-3.5 h-3.5" />
        Mostrar
      </span>
    </button>
  );
}

function CardHideButton({ onHide, title }: { onHide: () => void; title: string }) {
  return (
    <button
      onClick={onHide}
      className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-stone-500 hover:text-stone-200 transition-colors cursor-pointer pointer-events-auto relative z-20"
      title={title}
    >
      <EyeOff className="w-3.5 h-3.5" />
    </button>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const { character, animation, talkingAnimation, characterHidden, toggleCharacter, characterPose } =
    useCharacterConfig();

  // Hideable floating / side widgets — persisted, hydration-safe.
  const [sideVisible, , toggleSide] = usePersistentBoolean('spear_widgets_side', true);
  const [calendarVisible, , toggleCalendar] = usePersistentBoolean('spear_widgets_calendar', true);
  const [homeworksVisible, , toggleHomeworks] = usePersistentBoolean('spear_widgets_homeworks', true);
  const [briefingsVisible, , toggleBriefings] = usePersistentBoolean('spear_widgets_briefings', true);
  const [chatVisible, , toggleChat] = usePersistentBoolean('spear_widgets_chat', true);
  const [activityVisible, , toggleActivity] = usePersistentBoolean('spear_widgets_activity', true);

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

  const characterUrl = `/api/characters/${character}`;
  const animationUrl = animation !== 'procedural' ? `/api/animations/${animation}` : undefined;
  const talkingAnimationUrl = talkingAnimation !== 'procedural' ? `/api/animations/${talkingAnimation}` : undefined;

  return (
    <>
      {/* Page Content (renders mobile hero & status bar via DashboardClient) */}
      {children}

      {/* Mobile Flow for Todo Tab: Attention and Briefings in document scroll */}
      {isTodoTab && (
        <div className="md:hidden max-w-full min-w-0 gap-4 pointer-events-auto flex flex-col overflow-x-hidden">
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

      {/* Desktop Todo Tab: in-flow flex layout —
          left widgets | attention | character+chat stacked column.
          No fixed positioning here so nothing overlaps. */}
      {isTodoTab && (
        <div className="hidden md:block w-full min-w-0 max-w-full overflow-x-hidden pb-28">
          {/* Widget visibility toolbar */}
          <div className="flex items-center justify-end gap-2 mb-3">
            <button
              onClick={() => setToolbarOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-stone-400 hover:text-stone-200 border border-white/[0.08] text-xs transition-colors cursor-pointer pointer-events-auto relative z-20"
              title="Mostrar / ocultar widgets"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Widgets
              {toolbarOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {toolbarOpen && (
            <div className="mb-3 p-3 cyber-glass rounded-xl flex flex-wrap gap-2 text-xs pointer-events-auto relative z-20">
              {(
                [
                  { label: 'Side panel', active: sideVisible, toggle: toggleSide },
                  { label: 'Calendar', active: calendarVisible, toggle: toggleCalendar },
                  { label: 'Homeworks', active: homeworksVisible, toggle: toggleHomeworks },
                  { label: 'Briefings', active: briefingsVisible, toggle: toggleBriefings },
                  { label: 'Character', active: !characterHidden, toggle: toggleCharacter },
                  { label: 'Chat', active: chatVisible, toggle: toggleChat },
                  { label: 'Activity', active: activityVisible, toggle: toggleActivity },
                ] as const
              ).map((w) => (
                <button
                  key={w.label}
                  onClick={w.toggle}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    w.active
                      ? 'bg-accent-500/15 text-accent-300 border-accent-500/30'
                      : 'bg-white/[0.04] text-stone-500 border-white/[0.08] hover:text-stone-300'
                  }`}
                  title={w.active ? `Ocultar ${w.label}` : `Mostrar ${w.label}`}
                >
                  {w.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {w.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-row gap-4 items-start w-full min-w-0 max-w-full">
            {/* Left column: side widgets */}
            {sideVisible && (
              <div className="w-[280px] max-lg:w-[260px] shrink-0 min-w-0 flex flex-col gap-3">
                {calendarVisible ? (
                  <div className="relative min-w-0">
                    <div className="absolute top-2 right-2 z-20 pointer-events-auto">
                      <CardHideButton onHide={toggleCalendar} title="Ocultar calendario" />
                    </div>
                    <CalendarWidget />
                  </div>
                ) : (
                  <RestorePill label="Calendar" onShow={toggleCalendar} />
                )}

                {homeworksVisible ? (
                  <div className="relative min-w-0">
                    <div className="absolute top-2 right-2 z-20 pointer-events-auto">
                      <CardHideButton onHide={toggleHomeworks} title="Ocultar tareas" />
                    </div>
                    <ActiveHomeworksWidget />
                  </div>
                ) : (
                  <RestorePill label="Active Homeworks" onShow={toggleHomeworks} />
                )}

                {briefingsVisible ? (
                  <div className="relative min-w-0 flex flex-col gap-2">
                    <div className="flex justify-end">
                      <button
                        onClick={toggleBriefings}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-stone-500 hover:text-stone-200 text-[11px] transition-colors cursor-pointer pointer-events-auto relative z-20"
                        title="Ocultar briefings"
                      >
                        <EyeOff className="w-3 h-3" />
                        Ocultar briefings
                      </button>
                    </div>
                    <SyncBriefing expanded={briefingExpanded} />
                    <EmailBriefing expanded={briefingExpanded} />
                    <button
                      onClick={() => setBriefingExpanded((v) => !v)}
                      className="self-end text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer px-1"
                    >
                      {briefingExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                ) : (
                  <RestorePill label="Briefings" onShow={toggleBriefings} />
                )}
              </div>
            )}

            {/* Center column: what requires your attention */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <WhatRequiresYourAttentionWidget />
            </div>

            {/* Right column: character + chat stacked (flex-col, side by side with attention) */}
            <div className="w-[360px] max-lg:w-[320px] shrink-0 min-w-0 flex flex-col gap-4">
              {!characterHidden ? (
                <div className="cyber-glass rounded-xl overflow-hidden shadow-xl pointer-events-auto relative z-20">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-stone-900/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${characterPose === 'speaking' ? 'bg-emerald-400 animate-pulse' : characterPose === 'thinking' ? 'bg-amber-400 animate-pulse' : 'bg-accent-400'}`}
                      />
                      <span className="text-xs font-medium text-stone-200 truncate">Campus Copilot 3D</span>
                    </div>
                    <CardHideButton onHide={toggleCharacter} title="Ocultar personaje 3D" />
                  </div>
                  <div className="w-full h-[300px] relative pointer-events-none">
                    <CharacterViewer
                      characterUrl={characterUrl}
                      animationUrl={animationUrl}
                      talkingAnimationUrl={talkingAnimationUrl}
                      pose={characterPose}
                      className="w-full h-full pointer-events-none"
                    />
                  </div>
                </div>
              ) : (
                <RestorePill label="Character 3D" onShow={toggleCharacter} />
              )}

              {chatVisible ? (
                <div className="cyber-glass rounded-xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto relative z-20">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-stone-900/50">
                    <span className="text-[11px] text-stone-500 font-medium">Copilot</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setChatExpanded((v) => !v)}
                        className="text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer flex items-center gap-1 px-1"
                      >
                        {chatExpanded ? (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> Collapse
                          </>
                        ) : (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Expand chat
                          </>
                        )}
                      </button>
                      <CardHideButton onHide={toggleChat} title="Ocultar chat" />
                    </div>
                  </div>
                  <div className={chatExpanded ? 'h-[480px] min-h-0 flex flex-col' : ''}>
                    <CopilotChat expanded={chatExpanded} />
                  </div>
                </div>
              ) : (
                <RestorePill label="Copilot chat" onShow={toggleChat} />
              )}

              {activityVisible ? (
                <div className="cyber-glass rounded-xl shadow-xl overflow-hidden pointer-events-auto relative z-20">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-stone-900/50">
                    <button
                      onClick={() => setActivityOpen((v) => !v)}
                      className="flex items-center gap-2 cursor-pointer"
                      title={activityOpen ? 'Collapse activity' : 'Expand activity'}
                    >
                      <Radio className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-stone-100">Activity</h3>
                      {activityOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-stone-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-stone-500" />
                      )}
                    </button>
                    <CardHideButton onHide={toggleActivity} title="Ocultar actividad" />
                  </div>
                  {activityOpen && (
                    <div className="h-[300px]">
                      <LiveActivity onSyncEvent={handleSyncEvent} />
                    </div>
                  )}
                </div>
              ) : (
                <RestorePill label="Activity" onShow={toggleActivity} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop chat panel for non-todo tabs (hideable, fixed) */}
      {!isTodoTab && chatVisible && (
        <div
          className={`hidden md:block fixed bottom-28 right-6 z-40 w-[360px] max-lg:w-[320px] transition-all duration-300 ${
            chatExpanded ? 'h-[500px]' : 'h-auto'
          }`}
        >
          <div className={`cyber-glass rounded-xl shadow-2xl overflow-hidden flex flex-col ${chatExpanded ? 'h-full' : ''}`}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-stone-900/50">
              <span className="text-[11px] text-stone-500 font-medium">Copilot</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setChatExpanded((v) => !v)}
                  className="text-xs text-stone-500 hover:text-stone-300 transition-colors cursor-pointer flex items-center gap-1 px-1"
                >
                  {chatExpanded ? <><ChevronDown className="w-3.5 h-3.5" /> Collapse</> : <><ChevronUp className="w-3.5 h-3.5" /> Expand chat</>}
                </button>
                <CardHideButton onHide={toggleChat} title="Ocultar chat" />
              </div>
            </div>
            <div className={chatExpanded ? 'flex-1 min-h-0' : ''}>
              <CopilotChat expanded={chatExpanded} />
            </div>
          </div>
        </div>
      )}
      {!isTodoTab && !chatVisible && (
        <button
          onClick={toggleChat}
          className="hidden md:flex fixed bottom-28 right-6 z-40 items-center gap-2 px-4 py-2 rounded-full bg-stone-900/90 hover:bg-stone-800 border border-white/[0.1] text-stone-200 text-xs transition-all shadow-lg backdrop-blur-md cursor-pointer"
          title="Mostrar chat"
        >
          <Bot className="w-4 h-4 text-accent-300" />
          Mostrar chat
        </button>
      )}

      {/* Mobile Floating Action Buttons (FABs) */}
      <div className="fixed bottom-28 right-4 z-40 flex flex-col items-center gap-2.5 md:hidden">
        {isTodoTab && (
          <button
            onClick={() => setActivityOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-stone-900/90 border border-white/[0.1] text-accent-300 shadow-lg backdrop-blur-md active:scale-95 transition-transform cursor-pointer"
            title="Activity"
          >
            <Radio className="w-4 h-4 text-emerald-400" />
          </button>
        )}
        <button
          onClick={() => setMobileChatOpen(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center bg-accent-500 border border-accent-400/50 text-white shadow-xl backdrop-blur-md active:scale-95 transition-transform cursor-pointer"
          title="Copilot Chat"
        >
          <Bot className="w-5 h-5 text-accent-300" />
        </button>
      </div>

      {/* Mobile Copilot Chat Bottom Sheet (Kept mounted to preserve chat state) */}
      <div className={`fixed inset-x-3 bottom-20 top-16 z-50 cyber-glass rounded-2xl shadow-2xl flex-col overflow-hidden border border-white/[0.1] md:hidden animate-fade-in ${mobileChatOpen ? 'flex' : 'hidden'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-stone-900/60">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent-300" />
            <h3 className="text-sm font-semibold text-stone-100">Campus Copilot</h3>
          </div>
          <button
            onClick={() => setMobileChatOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone-400 hover:text-white transition-colors cursor-pointer"
            title="Cerrar chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 bg-stone-950/40">
          <CopilotChat expanded={true} />
        </div>
      </div>

      {/* Mobile Activity Bottom Sheet (Kept mounted to preserve live stream) */}
      <div className={`fixed inset-x-3 bottom-20 top-16 z-50 cyber-glass rounded-2xl shadow-2xl flex-col overflow-hidden border border-white/[0.1] md:hidden animate-fade-in ${activityOpen ? 'flex' : 'hidden'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-stone-900/60">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-stone-100">Live Activity</h3>
          </div>
          <button
            onClick={() => setActivityOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-stone-400 hover:text-white transition-colors cursor-pointer"
            title="Cerrar actividad"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <LiveActivity onSyncEvent={handleSyncEvent} />
        </div>
      </div>
    </>
  );
}
