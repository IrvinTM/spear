'use server';

import { getAttentionData, syncAttentionEventsFromMaterials } from '@/lib/attention/scanner';
import { getDb, initSchema } from '@/lib/db';
import type { AttentionData } from '@/lib/types';

export async function getAttentionAction(forceRefresh = false): Promise<AttentionData> {
  try {
    return await getAttentionData(forceRefresh);
  } catch (error) {
    console.error('Error fetching attention data:', error);
    return {
      currentWeek: 5,
      currentWeekLabel: 'Semana 5 (Del 07 al 13 de septiembre de 2026)',
      currentDate: new Date().toISOString(),
      thisWeekEvents: [],
      upcomingEvents: [],
      topEvents: [],
      allEvents: [],
      summary: 'No se pudo cargar el análisis de atención académica.',
      lastAnalyzedAt: null,
    };
  }
}

export async function refreshAttentionAction(): Promise<AttentionData> {
  try {
    await syncAttentionEventsFromMaterials(true);
    return await getAttentionData(false);
  } catch (error) {
    console.error('Error refreshing attention events:', error);
    return await getAttentionData(false);
  }
}

export async function dismissAttentionEventAction(eventId: number): Promise<{ success: boolean }> {
  try {
    initSchema();
    const db = getDb();
    db.prepare("UPDATE attention_events SET status = 'dismissed', updated_at = datetime('now') WHERE id = ?").run(eventId);
    return { success: true };
  } catch (error) {
    console.error('Error dismissing event:', error);
    return { success: false };
  }
}
