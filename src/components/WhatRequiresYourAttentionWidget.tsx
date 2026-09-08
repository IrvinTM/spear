'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  FileText,
  Rocket,
  Users,
  Timer,
  Wrench,
  Pin,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  RotateCw,
  Sparkles,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getAttentionAction,
  refreshAttentionAction,
  dismissAttentionEventAction,
} from '@/app/(dashboard)/dashboard/attention-actions';
import type { AttentionData, AttentionEvent } from '@/lib/types';

function getEventTypeBadge(type: AttentionEvent['eventType']) {
  switch (type) {
    case 'exam':
      return { label: 'Examen', icon: <FileText className="w-3 h-3" /> };
    case 'project':
      return { label: 'Proyecto', icon: <Rocket className="w-3 h-3" /> };
    case 'assignment':
      return { label: 'Tarea / Grupal', icon: <Users className="w-3 h-3" /> };
    case 'quiz':
      return { label: 'Corto', icon: <Timer className="w-3 h-3" /> };
    case 'workshop':
      return { label: 'Taller', icon: <Wrench className="w-3 h-3" /> };
    default:
      return { label: 'Actividad', icon: <Pin className="w-3 h-3" /> };
  }
}

export function WhatRequiresYourAttentionWidget() {
  const [data, setData] = useState<AttentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, startRefresh] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('spear_attention_hidden') === 'true') {
        setHidden(true);
      }
    } catch {}

    async function loadData() {
      setLoading(true);
      const res = await getAttentionAction();
      setData(res);
      setLoading(false);
    }

    void loadData();

    const handleRefresh = () => {
      void loadData();
    };
    window.addEventListener('todos:refresh', handleRefresh);
    return () => window.removeEventListener('todos:refresh', handleRefresh);
  }, []);

  const handleToggleHide = () => {
    const nextHidden = !hidden;
    setHidden(nextHidden);
    try {
      localStorage.setItem('spear_attention_hidden', String(nextHidden));
    } catch {
      // Ignore storage errors
    }
  };

  const handleManualRefresh = () => {
    startRefresh(async () => {
      const res = await refreshAttentionAction();
      setData(res);
    });
  };

  const handleDismiss = async (eventId: number) => {
    if (!data) return;
    setData({
      ...data,
      thisWeekEvents: data.thisWeekEvents.filter((e) => e.id !== eventId),
      upcomingEvents: data.upcomingEvents.filter((e) => e.id !== eventId),
      topEvents: data.topEvents.filter((e) => e.id !== eventId),
      allEvents: data.allEvents.filter((e) => e.id !== eventId),
    });
    await dismissAttentionEventAction(eventId);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-3">
        <div className="bg-stone-900/90 border border-white/[0.08] rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs text-stone-400 shadow-sm">
          <span className="spinner spinner--sm" />
          <span>Analizando Orientaciones Académicas...</span>
        </div>
      </div>
    );
  }

  const thisWeekList = data?.thisWeekEvents || [];
  const upcomingList = data?.upcomingEvents || [];
  const displayedUpcoming = showAllUpcoming ? upcomingList : upcomingList.slice(0, 3);
  const totalPending = thisWeekList.length + upcomingList.length;

  // Minimized / Hidden State: Clean, understated floating pill
  if (hidden) {
    return (
      <div className="flex items-center justify-center w-full my-2 pointer-events-auto relative z-20">
        <button
          onClick={handleToggleHide}
          className="group flex items-center gap-2 px-4 py-2 rounded-full bg-stone-900/90 hover:bg-stone-800 border border-white/[0.1] text-stone-200 text-xs transition-all shadow-lg backdrop-blur-md cursor-pointer active:scale-95"
          title="Mostrar widget de atención"
        >
          <span className="w-2 h-2 rounded-full bg-stone-400 group-hover:bg-accent-400 transition-colors" />
          <span className="font-medium">What Requires Your Attention</span>
          {totalPending > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-stone-300 border border-white/[0.08] text-[10px]">
              {totalPending}
            </span>
          )}
          <span className="text-stone-500 group-hover:text-stone-300 ml-1 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            <span>Mostrar</span>
          </span>
        </button>
      </div>
    );
  }

  const renderEventItem = (ev: AttentionEvent) => {
    const type = getEventTypeBadge(ev.eventType);

    return (
      <div
        key={`${ev.courseId}-${ev.title}-${ev.id}`}
        className="rounded-xl p-3.5 bg-stone-950/40 hover:bg-stone-900/50 border border-white/[0.06] hover:border-white/[0.1] transition-colors"
      >
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
          {/* Left: Type badge + Course Name + Weight */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-white/[0.06] text-stone-200 border border-white/[0.08] text-[11px] font-medium">
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </span>

            <span className="text-xs text-stone-300 font-medium">
              {ev.courseName} {ev.courseCode ? `(${ev.courseCode})` : ''}
            </span>

            {ev.weight && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-white/[0.06] text-stone-200 border border-white/[0.08]">
                {ev.weight}
              </span>
            )}
          </div>

          {/* Right: Week indicator or Dismiss */}
          <div className="flex items-center gap-2 ml-auto">
            {ev.weekNumber && (
              <span className="text-[11px] text-stone-400 font-medium bg-stone-950 px-2 py-0.5 rounded-md border border-white/[0.06]">
                Semana {ev.weekNumber}
              </span>
            )}
            <button
              onClick={() => handleDismiss(ev.id)}
              className="text-stone-500 hover:text-stone-300 p-1 cursor-pointer transition-colors"
              title="Descartar de esta lista"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-semibold text-stone-100 mb-1 leading-snug">
          {ev.title}
        </h4>

        {/* Description snippet if present */}
        {ev.description && (
          <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed mb-2">
            {ev.description}
          </p>
        )}

        {/* Date & Metadata */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400 pt-1.5 border-t border-white/[0.05]">
          <div className="flex items-center gap-1.5 text-stone-300">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            <span>{ev.dateLabel}</span>
          </div>

          {ev.daysRemaining !== null && ev.daysRemaining !== undefined && (
            <span className={`text-[11px] flex items-center gap-1 ${ev.daysRemaining === 0 ? 'text-amber-400/90 font-medium' : 'text-stone-400'}`}>
              {ev.daysRemaining === 0 ? (
                <>
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Hoy</span>
                </>
              ) : ev.daysRemaining > 0 ? (
                `En ~${ev.daysRemaining} días`
              ) : (
                `Hace ${Math.abs(ev.daysRemaining)} días`
              )}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto my-2 px-2 animate-fade-in relative z-20 pointer-events-auto">
      {/* Main Container Card — Muted, refined stone dark theme */}
      <div className="rounded-2xl bg-stone-900/85 border border-white/[0.08] p-5 shadow-xl backdrop-blur-xl transition-all">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-accent-400" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-stone-100 tracking-tight">
                  What Requires Your Attention
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-stone-300 border border-white/[0.08]">
                  {totalPending} pendientes
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {data?.currentWeekLabel || 'Semana 5 (Del 07 al 13 de septiembre de 2026)'}
              </p>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Re-analyze */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-stone-400 hover:text-stone-200 border border-white/[0.08] transition-colors cursor-pointer disabled:opacity-50 text-xs"
              title="Re-analizar Orientaciones Académicas"
            >
              {isRefreshing ? <span className="spinner spinner--sm" /> : <RotateCw className="w-3.5 h-3.5" />}
            </button>

            {/* Hide button */}
            <button
              onClick={handleToggleHide}
              className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 border border-white/[0.08] text-xs transition-colors cursor-pointer flex items-center gap-1.5 font-medium"
              title="Ocultar widget"
            >
              <EyeOff className="w-3.5 h-3.5 text-stone-400" />
              <span>Ocultar</span>
            </button>
          </div>
        </div>

        {/* AI Briefing Summary */}
        {data?.summary && (
          <div className="mt-3.5 mb-4 p-3 rounded-xl bg-stone-950/50 border border-white/[0.06] text-xs text-stone-300 flex items-start gap-2.5 leading-relaxed">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-stone-300">
              <span className="font-medium text-stone-200">Resumen: </span>
              {data.summary}
            </div>
          </div>
        )}

        {/* SECTION 1: THIS WEEK */}
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
              <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider">
                This Week (Esta Semana)
              </h4>
            </div>
            <span className="text-[11px] text-stone-400">
              {thisWeekList.length} {thisWeekList.length === 1 ? 'actividad' : 'actividades'}
            </span>
          </div>

          <div className="space-y-2">
            {thisWeekList.length === 0 ? (
              <div className="text-xs text-stone-400 bg-stone-950/40 rounded-xl p-3 border border-white/[0.05] italic">
                No hay exámenes ni tareas fijadas para esta semana. Buen momento para preparar las evaluaciones de la próxima semana.
              </div>
            ) : (
              thisWeekList.map(renderEventItem)
            )}
          </div>
        </div>

        {/* DIVIDER */}
        <div className="border-t border-white/[0.06] my-4" />

        {/* SECTION 2: UPCOMING / FOLLOWING WEEKS */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-stone-400" />
              <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider">
                Upcoming (Próximas Semanas)
              </h4>
            </div>
            <button
              onClick={() => setShowAllUpcoming(!showAllUpcoming)}
              className="text-[11px] text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
            >
              {showAllUpcoming ? 'Mostrar solo las 3 más próximas' : `Ver todas (${upcomingList.length})`}
            </button>
          </div>

          <div className="space-y-2">
            {displayedUpcoming.length === 0 ? (
              <div className="text-xs text-stone-400 bg-stone-950/40 rounded-xl p-3 border border-white/[0.05] italic">
                No hay evaluaciones próximas registradas.
              </div>
            ) : (
              displayedUpcoming.map(renderEventItem)
            )}
          </div>
        </div>

        {/* Footer */}
        {upcomingList.length > 3 && (
          <div className="mt-3 pt-2 border-t border-white/[0.05] flex justify-end">
            <button
              onClick={() => setShowAllUpcoming(!showAllUpcoming)}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              {showAllUpcoming ? (
                <>
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Ver solo las 3 más próximas
                </>
              ) : (
                <>
                  Ver {upcomingList.length - 3} evaluaciones más
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
