import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getAgentHome } from '@/lib/config';
import { generateAudio } from '@/lib/tts';
import { getDb } from '@/lib/db';

function getAudioCacheDir(): string {
  return path.join(getAgentHome(), 'data', 'audio-cache');
}

/**
 * Returns cached audio for a sync snapshot, generating it if not cached.
 */
export async function getSnapshotAudio(snapshotId: number): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  const db = getDb();
  const row = db.prepare(
    'SELECT summary_text, audio_cache_path, audio_content_type FROM sync_snapshots WHERE id = ?'
  ).get(snapshotId) as {
    summary_text: string | null;
    audio_cache_path: string | null;
    audio_content_type: string | null;
  } | undefined;

  if (!row?.summary_text) return null;

  // Serve from cache if available
  if (row.audio_cache_path && row.audio_content_type) {
    try {
      const buffer = await fs.readFile(row.audio_cache_path);
      return { buffer, contentType: row.audio_content_type };
    } catch {
      // Cache file missing — regenerate below
    }
  }

  // Generate and cache
  const { buffer, contentType } = await generateAudio(row.summary_text);
  const cacheDir = getAudioCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  
  const hash = crypto.createHash('sha256').update(row.summary_text).digest('hex').slice(0, 12);
  const ext = contentType === 'audio/mpeg' ? '.mp3' : '.wav';
  const cachePath = path.join(cacheDir, `snapshot-${snapshotId}-${hash}${ext}`);
  await fs.writeFile(cachePath, buffer);

  db.prepare(
    'UPDATE sync_snapshots SET audio_cache_path = ?, audio_content_type = ? WHERE id = ?'
  ).run(cachePath, contentType, snapshotId);

  return { buffer, contentType };
}

export async function getEmailBriefingAudio(text: string): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  if (!text) return null;

  const cacheDir = getAudioCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  const mp3Path = path.join(cacheDir, `email-briefing-${hash}.mp3`);
  const wavPath = path.join(cacheDir, `email-briefing-${hash}.wav`);

  // Try to read from cache
  try {
    const buffer = await fs.readFile(mp3Path);
    return { buffer, contentType: 'audio/mpeg' };
  } catch {}
  try {
    const buffer = await fs.readFile(wavPath);
    return { buffer, contentType: 'audio/wav' };
  } catch {}

  // Generate and cache
  const { buffer, contentType } = await generateAudio(text);
  const ext = contentType === 'audio/mpeg' ? '.mp3' : '.wav';
  const cachePath = path.join(cacheDir, `email-briefing-${hash}${ext}`);
  await fs.writeFile(cachePath, buffer);

  return { buffer, contentType };
}
