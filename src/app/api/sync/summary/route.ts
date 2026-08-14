import { NextResponse } from 'next/server';
import { getDb, initSchema } from '@/lib/db';
import { generateSyncSummary } from '@/lib/sync-summary';

export async function GET() {
  try {
    initSchema();
    const db = getDb();
    
    // Get latest snapshot (prefer unread)
    const snapshot = db.prepare(`
      SELECT id, diff_json, summary_text, is_read, created_at
      FROM sync_snapshots
      ORDER BY is_read ASC, created_at DESC
      LIMIT 1
    `).get() as { id: number; diff_json: string; summary_text: string | null; is_read: number; created_at: string } | undefined;

    if (!snapshot) {
      return NextResponse.json({ hasSummary: false });
    }

    // Generate summary lazily if needed
    let summaryText = snapshot.summary_text;
    if (!summaryText) {
      summaryText = await generateSyncSummary(snapshot.id);
    }

    const diff = JSON.parse(snapshot.diff_json);
    const isEmpty = !diff.newCourses?.length && !diff.newAssignments?.length 
      && !diff.newMaterials?.length && !diff.filesDownloaded?.length;

    return NextResponse.json({
      hasSummary: true,
      snapshotId: snapshot.id,
      summaryText,
      isRead: !!snapshot.is_read,
      isEmpty,
      createdAt: snapshot.created_at,
      diff,
    });
  } catch (error) {
    console.error('Summary API Error:', error);
    return NextResponse.json({ hasSummary: false, error: 'Failed to load summary' });
  }
}

export async function POST(req: Request) {
  // Mark a snapshot as read
  try {
    const { snapshotId } = await req.json();
    initSchema();
    getDb().prepare('UPDATE sync_snapshots SET is_read = 1 WHERE id = ?').run(snapshotId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
