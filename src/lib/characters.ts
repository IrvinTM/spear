import fs from 'node:fs/promises';
import path from 'node:path';
import { getAgentHome } from '@/lib/config';

const CHARACTERS_DIR = () => path.join(getAgentHome(), 'data', 'characters');
const DEFAULT_CHARACTER = 'default_character.glb';

export async function getCharactersDir(): Promise<string> {
  const dir = CHARACTERS_DIR();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function listCharacters(): Promise<string[]> {
  const dir = await getCharactersDir();
  const files = await fs.readdir(dir);
  const bundledDir = path.join(process.cwd(), 'public', 'defaults');
  const bundledFiles = await fs.readdir(bundledDir).catch(() => []);
  const allFiles = Array.from(new Set([...files, ...bundledFiles]));
  return allFiles.filter(f => f.endsWith('.vrm') || f.endsWith('.glb'));
}

export async function getActiveCharacter(): Promise<string> {
  // Could later be stored in DB settings
  return DEFAULT_CHARACTER;
}

export async function getCharacterPath(filename: string): Promise<string | null> {
  const dir = await getCharactersDir();
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
