import { getDb, initSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  initSchema();
  const url = new URL(req.url);
  const sinceParam = Number(url.searchParams.get('since') || '0');
  let lastId = sinceParam;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(':keepalive\n\n'));

      // If initial connection (since=0), seed with the last 40 entries
      if (sinceParam === 0) {
        try {
          const initialRows = getDb()
            .prepare('SELECT * FROM (SELECT * FROM request_logs ORDER BY id DESC LIMIT 40) ORDER BY id ASC')
            .all() as Array<Record<string, unknown>>;
          for (const row of initialRows) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
            lastId = Math.max(lastId, row.id as number);
          }
        } catch {
          // Ignore table access errors during bootstrap
        }
      }

      const interval = setInterval(() => {
        try {
          const rows = getDb()
            .prepare('SELECT * FROM request_logs WHERE id > ? ORDER BY id ASC LIMIT 50')
            .all(lastId) as Array<Record<string, unknown>>;

          for (const row of rows) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
            lastId = row.id as number;
          }
        } catch {
          // DB may be unavailable briefly during migrations
        }
      }, 1500);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
