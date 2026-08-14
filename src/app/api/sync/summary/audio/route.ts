import { NextResponse } from 'next/server';
import { initSchema } from '@/lib/db';
import { getSnapshotAudio } from '@/lib/audio-cache';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const snapshotId = Number(url.searchParams.get('id'));
    if (!snapshotId) {
      return NextResponse.json({ error: 'Missing snapshot id' }, { status: 400 });
    }

    initSchema();
    const result = await getSnapshotAudio(snapshotId);
    if (!result) {
      return NextResponse.json({ error: 'No audio available' }, { status: 404 });
    }

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.buffer.length),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Summary Audio Error:', error);
    return NextResponse.json({ error: 'Audio generation failed' }, { status: 500 });
  }
}
