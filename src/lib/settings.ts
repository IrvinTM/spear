import fs from 'node:fs';
import path from 'node:path';
import { getAgentHome } from '@/lib/config';

export interface AppSettings {
  tts: {
    provider: 'piper' | 'google';
    piper: {
      path: string;
      modelPath: string;
    };
    google: {
      apiKey: string;
      voice: string;
      languageCode: string;
      modelName: string;
      prompt: string;
      speakingRate: number;
      pitch: number;
    };
  };
  character: string;
  animation: string;
  talkingAnimation: string;
}

const DEFAULTS: AppSettings = {
  tts: {
    provider: 'piper',
    piper: {
      path: 'piper',
      modelPath: 'es_AR-daniela-high.onnx',
    },
    google: {
      apiKey: '',
      voice: 'Sulafat',
      languageCode: 'es-419',
      modelName: 'gemini-3.1-flash-tts-preview',
      prompt: 'Read aloud in a warm, welcoming tone.',
      speakingRate: 1,
      pitch: 0,
    },
  },
  character: 'cosmic-dweller.vrm',
  animation: 'idle_loop.vrma',
  talkingAnimation: 'talking.vrma',
};

function getSettingsPath(): string {
  return path.join(getAgentHome(), 'settings.json');
}

export function getSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved, tts: { ...DEFAULTS.tts, ...saved.tts, piper: { ...DEFAULTS.tts.piper, ...saved.tts?.piper }, google: { ...DEFAULTS.tts.google, ...saved.tts?.google } } };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: AppSettings): void {
  const dir = getAgentHome();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}
