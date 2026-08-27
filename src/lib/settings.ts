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
  background: string;
  calendarUrl: string;
  hideCharacter?: boolean;
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
  character: 'default_character.glb',
  animation: 'idle_default.vrma',
  talkingAnimation: 'talking_default.vrma',
  background: 'https://r4.wallpaperflare.com/wallpaper/781/587/704/blender-floating-particles-digital-art-hexagon-hd-wallpaper-08f6dd68b070bcc8e0fc715e7812249a.jpg',
  calendarUrl: '',
  hideCharacter: false,
};

function getSettingsPath(): string {
  return path.join(getAgentHome(), 'settings.json');
}

export function getSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const saved = JSON.parse(raw);
    
    // Migrate old default names to new default names
    if (saved.character === 'cosmic-dweller.vrm' || saved.character === 'default_character.vrm' || saved.character === 'waifu1.glb') {
      saved.character = 'default_character.glb';
    }
    if (saved.animation === 'idle_loop.vrma') saved.animation = 'idle_default.vrma';
    if (saved.talkingAnimation === 'talking.vrma') saved.talkingAnimation = 'talking_default.vrma';

    return { 
      ...DEFAULTS, 
      ...saved, 
      character: saved.character || DEFAULTS.character,
      animation: saved.animation || DEFAULTS.animation,
      talkingAnimation: saved.talkingAnimation || DEFAULTS.talkingAnimation,
      background: saved.background || DEFAULTS.background,
      calendarUrl: saved.calendarUrl || DEFAULTS.calendarUrl,
      hideCharacter: saved.hideCharacter !== undefined ? saved.hideCharacter : DEFAULTS.hideCharacter,
      tts: { ...DEFAULTS.tts, ...saved.tts, piper: { ...DEFAULTS.tts.piper, ...saved.tts?.piper }, google: { ...DEFAULTS.tts.google, ...saved.tts?.google } } 
    };
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
