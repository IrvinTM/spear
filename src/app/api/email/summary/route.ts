import { NextResponse } from 'next/server';
import { getDb, initSchema } from '@/lib/db';

export async function GET() {
  try {
    initSchema();
    const db = getDb();
    
    // Get last sync info from sync_log for emails
    const lastSync = db.prepare(`
      SELECT started_at, completed_at, items_synced
      FROM sync_log
      WHERE sync_type = 'email' AND status = 'success'
      ORDER BY completed_at DESC
      LIMIT 1
    `).get() as { started_at: string; completed_at: string; items_synced: number } | undefined;

    if (!lastSync) {
      return NextResponse.json({ hasSummary: false });
    }

    let summaryText = '';
    let audioText = '';
    let emails: any[] = [];

    const cleanText = (text: string) => {
      if (!text) return '';
      return text
        .replace(/["*_~`#\[\](){}]/g, '') // remove markdown and brackets
        .replace(/[<>\/\\|:+]/g, ' ')      // replace slashes/colons/math with spaces
        .replace(/&[a-z]+;/gi, ' ')       // remove html entities
        .replace(/[^\w\s\u00C0-\u017F.,!?¡¿]/g, '') // keep only alphanumeric, spanish accents, spaces, and basic punctuation
        .replace(/\s+/g, ' ')              // collapse spaces
        .trim();
    };

    if (lastSync.items_synced === 0) {
      summaryText = 'No se encontraron correos nuevos en la última sincronización.';
      audioText = 'No se encontraron correos nuevos en la última sincronización.';
    } else {
      emails = db.prepare(`
        SELECT id, from_name, subject, summary, received_at
        FROM emails
        WHERE last_synced_at >= ?
        ORDER BY received_at DESC
        LIMIT 10
      `).all(lastSync.started_at) as any[];

      summaryText = `Se sincronizaron ${lastSync.items_synced} correos nuevos. ` + emails.map((e, idx) => {
        return `${idx + 1}: De ${e.from_name || 'Desconocido'}, sobre "${e.subject}". ${e.summary || ''}`;
      }).join(' ');

      audioText = `Se sincronizaron ${lastSync.items_synced} correos nuevos. ` + emails.map((e, idx) => {
        return `Correo ${idx + 1}. De ${cleanText(e.from_name || 'Desconocido')}, sobre ${cleanText(e.subject)}. ${cleanText(e.summary || '')}`;
      }).join(' ');
    }

    return NextResponse.json({
      hasSummary: true,
      summaryText,
      audioText,
      emails,
      lastSyncAt: lastSync.completed_at,
    });
  } catch (error) {
    console.error('Email Summary API Error:', error);
    return NextResponse.json({ hasSummary: false, error: 'Failed to load summary' });
  }
}
