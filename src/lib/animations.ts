import fs from 'node:fs/promises';
import path from 'node:path';
import { getAgentHome } from '@/lib/config';

const ANIMATIONS_DIR = () => path.join(getAgentHome(), 'data', 'animations');

export async function getAnimationsDir(): Promise<string> {
  const dir = ANIMATIONS_DIR();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function listAnimations(): Promise<string[]> {
  const dir = await getAnimationsDir();
  const files = await fs.readdir(dir);
  const bundledDir = path.join(process.cwd(), 'public', 'defaults');
  const bundledFiles = await fs.readdir(bundledDir).catch(() => []);
  const allFiles = Array.from(new Set([...files, ...bundledFiles]));
  return allFiles.filter(f => f.endsWith('.vrma') || f.endsWith('.glb'));
}

export async function getAnimationPath(filename: string): Promise<string | null> {
  const dir = await getAnimationsDir();
  const filePath = path.join(dir, filename);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    const bundled = path.join(process.cwd(), 'public', 'defaults', filename);
    try {
      await fs.access(bundled);
      return bundled;
    } catch {
      return null;
    }
  }
}
