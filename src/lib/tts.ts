import { spawn } from 'child_process';
import { getSettings } from '@/lib/settings';

function cleanTextForTts(text: string): string {
  let clean = text.replace(/[\*\#\_\[\]\(\)]/g, '');
  clean = clean.replace(/\n/g, ' ').trim();
  return clean;
}

export async function generateAudio(text: string): Promise<{ buffer: Buffer; contentType: string }> {
  const clean = cleanTextForTts(text);
  const settings = getSettings();

  if (settings.tts.provider === 'google') {
    return generateGoogleAudio(clean, settings.tts.google);
  }
  const buffer = await generatePiperAudio(clean, settings.tts.piper);
  return { buffer, contentType: 'audio/wav' };
}

/* ------------------------------------------------------------------ */
/*  Piper (local)                                                     */
/* ------------------------------------------------------------------ */

function generatePiperAudio(
  text: string,
  config: { path: string; modelPath: string },
): Promise<Buffer> {
  const piperPath = process.env.PIPER_PATH || config.path;
  const modelPath = process.env.PIPER_MODEL_PATH || config.modelPath;

  return new Promise((resolve, reject) => {
    const child = spawn(piperPath, [
      '--model', modelPath,
      '--output_file', '-'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    child.stdin.write(text + '\n');
    child.stdin.end();
  });
}

/* ------------------------------------------------------------------ */
/*  Google Cloud Text-to-Speech                                       */
/* ------------------------------------------------------------------ */

async function getGoogleAccessToken(): Promise<string> {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to obtain Google access token');
  return token.token;
}

async function generateGoogleAudio(
  text: string,
  config: { apiKey: string; voice: string; languageCode: string },
): Promise<{ buffer: Buffer; contentType: string }> {
  const endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
  const apiKey = process.env.GOOGLE_TTS_API_KEY || config.apiKey;

  const body = {
    input: { text },
    voice: {
      languageCode: process.env.GOOGLE_TTS_LANGUAGE || config.languageCode,
      name: process.env.GOOGLE_TTS_VOICE || config.voice,
    },
    audioConfig: {
      audioEncoding: 'MP3',
    },
  };

  let url: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (apiKey) {
    url = `${endpoint}?key=${apiKey}`;
  } else {
    url = endpoint;
    const token = await getGoogleAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google TTS API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { audioContent: string };
  const buffer = Buffer.from(data.audioContent, 'base64');
  return { buffer, contentType: 'audio/mpeg' };
}
