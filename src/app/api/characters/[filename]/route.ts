import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { getCharacterPath } from '@/lib/characters';

export async function GET(req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  
  if (!filename.endsWith('.vrm') && !filename.endsWith('.glb')) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  const filePath = await getCharacterPath(filename);
  if (!filePath) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Failed to read character file', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
