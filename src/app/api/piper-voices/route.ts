import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function GET() {
  try {
    const homeDir = os.homedir();
    const piperDir = path.join(homeDir, '.local', 'share', 'piper');
    
    let files: string[] = [];
    try {
      files = await fs.readdir(piperDir);
    } catch (e) {
      // Directory might not exist
      files = [];
    }

    const voices = files.filter(f => f.endsWith('.onnx'));
    return NextResponse.json({ voices });
  } catch (error) {
    console.error('Failed to list piper voices', error);
    return NextResponse.json({ error: 'Failed to list voices' }, { status: 500 });
  }
}
