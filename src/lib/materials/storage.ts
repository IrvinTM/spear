import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAgentHome } from '@/lib/config';

export const DEFAULT_MAX_MATERIAL_FILE_BYTES = 25 * 1024 * 1024;

export function getMaterialMaxFileBytes(): number {
  const configured = Number(process.env.MATERIAL_MAX_FILE_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_MAX_MATERIAL_FILE_BYTES;
}

export function getMaterialsRoot(): string {
  return path.join(getAgentHome(), 'data', 'materials');
}

export function getCourseMaterialsDirectory(courseId: number): string {
  return path.join(getMaterialsRoot(), `course-${courseId}`);
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_ .]+|[_ .]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export function buildMaterialPath(
  courseId: number,
  sectionPosition: number,
  moduleId: number,
  filename: string,
): string {
  return path.join(
    getCourseMaterialsDirectory(courseId),
    `section-${sectionPosition}`,
    `module-${moduleId}`,
    safeSegment(filename, 'material.bin'),
  );
}

export async function writeMaterialFile(destination: string, bytes: Buffer): Promise<{ size: number; hash: string }> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, bytes);
  await fs.rename(temp, destination);
  return {
    size: bytes.length,
    hash: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function removeMaterialFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}
