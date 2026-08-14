'use client';

import { useState, useTransition, useEffect } from 'react';
import { updateSettings } from './actions';
import { AlertBanner } from '@/components/AlertBanner';
import type { AppSettings } from '@/lib/settings';

const inputClass =
  'w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 text-sm outline-none placeholder:text-stone-500 transition-all focus:border-accent-500 focus:ring-[3px] focus:ring-accent-500/15';

const labelClass = 'text-sm font-medium text-stone-400 tracking-wide';

export function SettingsClient({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, startSave] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [availableCharacters, setAvailableCharacters] = useState<string[]>([]);
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(d => setAvailableCharacters(d.characters || []))
      .catch(() => {});
      
    fetch('/api/animations')
      .then(r => r.json())
      .then(d => setAvailableAnimations(d.animations || []))
      .catch(() => {});
  }, []);

  const update = (path: string, value: string) => {
    setFeedback(null);
    setSettings((prev) => {
      const next = structuredClone(prev);
      const keys = path.split('.');
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      const last = keys[keys.length - 1];
      const current = obj[last];
      obj[last] = typeof current === 'number' ? Number(value) : value;
      return next;
    });
  };

  const handleSave = () => {
    startSave(async () => {
      const result = await updateSettings(settings);
      if (result.success) {
        setFeedback({ type: 'success', message: 'Settings saved.' });
      } else {
        setFeedback({ type: 'error', message: result.error || 'Failed to save.' });
      }
    });
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Settings</h1>
        <p className="text-sm text-stone-400">Configure your Spear dashboard.</p>
      </div>

      {feedback && <AlertBanner variant={feedback.type} message={feedback.message} />}

      {/* Appearance Section */}
      <div className="bg-stone-900 border border-white/[0.06] rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-base font-semibold mb-1">Appearance</h2>
        <p className="text-xs text-stone-500 mb-6">Customize your dashboard character.</p>
        
        <div className="flex flex-col gap-2">
          <label className={labelClass}>3D Character Model</label>
          <select
            value={settings.character}
            onChange={(e) => update('character', e.target.value)}
            className={`${inputClass} appearance-none cursor-pointer`}
          >
            {availableCharacters.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-xs text-stone-500">
            Drop .vrm or .glb files into `~/.ues-agent/data/characters/` to add more.
          </p>
        </div>
        
        <div className="flex flex-col gap-2 mt-4">
          <label className={labelClass}>Idle Animation</label>
          <select
            value={settings.animation}
            onChange={(e) => update('animation', e.target.value)}
            className={`${inputClass} appearance-none cursor-pointer`}
          >
            <option value="procedural">Procedural (Built-in)</option>
            {availableAnimations.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col gap-2 mt-4">
          <label className={labelClass}>Talking Animation</label>
          <select
            value={settings.talkingAnimation}
            onChange={(e) => update('talkingAnimation', e.target.value)}
            className={`${inputClass} appearance-none cursor-pointer`}
          >
            <option value="procedural">Procedural (Built-in)</option>
            {availableAnimations.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <p className="text-xs text-stone-500 mt-2">
            Drop .vrma files into `~/.ues-agent/data/animations/` to add custom animations.
          </p>
        </div>
      </div>

      {/* TTS Section */}
      <div className="bg-stone-900 border border-white/[0.06] rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-base font-semibold mb-1">Text-to-Speech</h2>
        <p className="text-xs text-stone-500 mb-6">Configure how Campus Copilot speaks.</p>

        {/* Provider toggle */}
        <div className="flex flex-col gap-2 mb-6">
          <label className={labelClass}>Provider</label>
          <div className="flex gap-2">
            {(['piper', 'google'] as const).map((p) => (
              <button
                key={p}
                onClick={() => update('tts.provider', p)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                  settings.tts.provider === p
                    ? 'bg-accent-600 text-white border-accent-700 shadow-sm'
                    : 'bg-stone-800 text-stone-400 border-white/[0.06] hover:bg-stone-700 hover:text-stone-200'
                }`}
              >
                {p === 'piper' ? 'Piper (Local)' : 'Google Cloud TTS'}
              </button>
            ))}
          </div>
        </div>

        {/* Piper settings */}
        {settings.tts.provider === 'piper' && (
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-stone-950 border border-white/[0.04]">
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Piper binary path</label>
              <input
                type="text"
                value={settings.tts.piper.path}
                onChange={(e) => update('tts.piper.path', e.target.value)}
                placeholder="piper"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Voice model path</label>
              <input
                type="text"
                value={settings.tts.piper.modelPath}
                onChange={(e) => update('tts.piper.modelPath', e.target.value)}
                placeholder="es_AR-daniela-high.onnx"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {/* Google TTS settings */}
        {settings.tts.provider === 'google' && (
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-stone-950 border border-white/[0.04]">
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Model</label>
              <input
                type="text"
                value={settings.tts.google.modelName}
                onChange={(e) => update('tts.google.modelName', e.target.value)}
                placeholder="gemini-3.1-flash-tts-preview"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Voice name</label>
                <input
                  type="text"
                  value={settings.tts.google.voice}
                  onChange={(e) => update('tts.google.voice', e.target.value)}
                  placeholder="Sulafat"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Language code</label>
                <input
                  type="text"
                  value={settings.tts.google.languageCode}
                  onChange={(e) => update('tts.google.languageCode', e.target.value)}
                  placeholder="es-419"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Voice prompt</label>
              <input
                type="text"
                value={settings.tts.google.prompt}
                onChange={(e) => update('tts.google.prompt', e.target.value)}
                placeholder="Read aloud in a warm, welcoming tone."
                className={inputClass}
              />
              <p className="text-xs text-stone-500">
                Controls the tone and style of the voice.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Speaking rate</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.25"
                  max="4"
                  value={settings.tts.google.speakingRate}
                  onChange={(e) => update('tts.google.speakingRate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Pitch</label>
                <input
                  type="number"
                  step="1"
                  min="-20"
                  max="20"
                  value={settings.tts.google.pitch}
                  onChange={(e) => update('tts.google.pitch', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium border border-accent-700 shadow-sm hover:bg-accent-500 hover:shadow-glow hover:-translate-y-px active:bg-accent-700 active:translate-y-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSaving ? (
          <>
            <span className="spinner spinner--sm" />
            Saving...
          </>
        ) : (
          'Save settings'
        )}
      </button>
    </>
  );
}
