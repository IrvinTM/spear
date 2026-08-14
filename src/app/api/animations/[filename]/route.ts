import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { getAnimationPath } from '@/lib/animations';

export async function GET(req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  
  if (!filename.endsWith('.vrma') && !filename.endsWith('.glb')) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  const filePath = await getAnimationPath(filename);
  if (!filePath) {
    return NextResponse.json({ error: 'Animation not found' }, { status: 404 });
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
    console.error('Failed to read animation file', error);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
