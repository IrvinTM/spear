'use server';

export type ActivityLogRow = {
  id: number;
  category: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  method: string | null;
  url: string | null;
  statusCode: number | null;
  durationMs: number | null;
  details: string | null;
  createdAt: string;
};

export async function getActivityLogs(): Promise<ActivityLogRow[]> {
  try {
    const { getDb, initSchema } = await import('@/lib/db');
    initSchema();
    return getDb().prepare(`
      SELECT id, category, level, message, method, url, status_code as statusCode,
        duration_ms as durationMs, details, created_at as createdAt
      FROM request_logs
      ORDER BY id DESC
      LIMIT 500
    `).all() as ActivityLogRow[];
  } catch {
    return [];
  }
}
