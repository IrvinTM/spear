'use client';

import { useState, useTransition } from 'react';
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

  const update = (path: string, value: string) => {
    setFeedback(null);
    setSettings((prev) => {
      const next = structuredClone(prev);
      const keys = path.split('.');
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
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
              <label className={labelClass}>
                API key
                <span className="font-normal text-stone-500"> (leave empty for service account auth)</span>
              </label>
              <input
                type="password"
                value={settings.tts.google.apiKey}
                onChange={(e) => update('tts.google.apiKey', e.target.value)}
                placeholder="AIza..."
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Voice name</label>
              <input
                type="text"
                value={settings.tts.google.voice}
                onChange={(e) => update('tts.google.voice', e.target.value)}
                placeholder="es-US-Studio-B"
                className={inputClass}
              />
              <p className="text-xs text-stone-500">
                See available voices at cloud.google.com/text-to-speech/docs/voices
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Language code</label>
              <input
                type="text"
                value={settings.tts.google.languageCode}
                onChange={(e) => update('tts.google.languageCode', e.target.value)}
                placeholder="es-US"
                className={inputClass}
              />
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
