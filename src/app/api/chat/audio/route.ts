import { NextResponse } from 'next/server';
import { generateAudio } from '@/lib/tts';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const { buffer, contentType } = await generateAudio(text);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error('Audio API Error:', error);
    return NextResponse.json({ error: 'Audio generation failed' }, { status: 500 });
  }
}
