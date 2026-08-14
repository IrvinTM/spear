import { getDb } from '@/lib/db';

export type ActivityLogInput = {
  category: 'moodle_api' | 'file_download' | 'sync' | 'chat' | 'agy_call';
  level?: 'info' | 'warning' | 'error';
  message: string;
  method?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  details?: Record<string, unknown>;
};

function sanitizeUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawUrl.split('?')[0];
  }
}

/** Best-effort local logging: activity logging must never break the operation it observes. */
export function logActivity(input: ActivityLogInput): void {
  try {
    getDb().prepare(`
      INSERT INTO request_logs (category, level, message, method, url, status_code, duration_ms, details)
      VALUES (@category, @level, @message, @method, @url, @status_code, @duration_ms, @details)
    `).run({
      category: input.category,
      level: input.level || 'info',
      message: input.message,
      method: input.method || null,
      url: sanitizeUrl(input.url),
      status_code: input.statusCode ?? null,
      duration_ms: input.durationMs ?? null,
      details: input.details ? JSON.stringify(input.details) : null,
    });
  } catch {
    // The logging schema can be unavailable during first-run setup.
  }
}
