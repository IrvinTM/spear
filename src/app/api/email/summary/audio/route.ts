import { NextResponse } from 'next/server';
import { getEmailBriefingAudio } from '@/lib/audio-cache';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const text = url.searchParams.get('text');
    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const result = await getEmailBriefingAudio(text);
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
    console.error('Email Summary Audio Error:', error);
    return NextResponse.json({ error: 'Audio generation failed' }, { status: 500 });
  }
}
