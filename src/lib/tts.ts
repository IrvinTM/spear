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
/*  Google Cloud Text-to-Speech (v1beta1 — Gemini TTS)                */
/* ------------------------------------------------------------------ */

async function generateGoogleAudio(
  text: string,
  config: { apiKey: string; voice: string; languageCode: string; modelName: string; prompt: string; speakingRate: number; pitch: number },
): Promise<{ buffer: Buffer; contentType: string }> {
  const { v1beta1, protos } = await import('@google-cloud/text-to-speech');

  const client = new v1beta1.TextToSpeechClient();

  const [response] = await client.synthesizeSpeech({
    input: {
      text,
      prompt: config.prompt || undefined,
    },
    voice: {
      languageCode: process.env.GOOGLE_TTS_LANGUAGE || config.languageCode,
      name: process.env.GOOGLE_TTS_VOICE || config.voice,
      modelName: config.modelName,
    },
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1beta1.AudioEncoding.LINEAR16,
      speakingRate: config.speakingRate,
      pitch: config.pitch,
    },
  });

  if (!response.audioContent) {
    throw new Error('Google TTS returned empty audio content');
  }

  const buffer = Buffer.from(response.audioContent as Uint8Array);
  return { buffer, contentType: 'audio/wav' };
}
