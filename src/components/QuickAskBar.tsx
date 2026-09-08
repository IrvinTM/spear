'use client';

import { useState, useRef, useCallback } from 'react';
import { Sparkles, Send, Loader2, Volume2, Pause, X } from 'lucide-react';
import { playThinkingCue, playCompleteCue, playErrorCue } from '@/lib/client/audio-cues';

export function QuickAskBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [latestResponse, setLatestResponse] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
    window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
  }, []);

  const playVoice = useCallback((text: string) => {
    stopAudio();
    fetch('/api/chat/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(res => {
        if (!res.ok) return null;
        return res.blob();
      })
      .then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => {
          setIsPlayingAudio(true);
          window.dispatchEvent(new CustomEvent('character-pose', { detail: 'speaking' }));
        };
        audio.onended = () => {
          setIsPlayingAudio(false);
          window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsPlayingAudio(false);
          window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
          URL.revokeObjectURL(url);
        };
        audio.play();
      })
      .catch(() => {});
  }, [stopAudio]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setInput('');
    setLoading(true);
    setLatestResponse(null);
    stopAudio();

    window.dispatchEvent(new CustomEvent('character-pose', { detail: 'thinking' }));
    playThinkingCue();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });
      const data = await res.json();

      if (data.text) {
        playCompleteCue();
        setLatestResponse(data.text);
        // Sync with Copilot chat history
        window.dispatchEvent(
          new CustomEvent('copilot:external-message', {
            detail: { user: query, assistant: data.text },
          })
        );
        // Play TTS aloud through character
        playVoice(data.text);
      } else {
        playErrorCue();
        setLatestResponse('No pude procesar tu consulta.');
        window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
      }
    } catch {
      playErrorCue();
      setLatestResponse('Error de conexión con el copiloto.');
      window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-2 pointer-events-auto">
      {/* Response speech bubble if active */}
      {latestResponse && (
        <div className="cyber-glass rounded-xl p-3 text-xs text-stone-200 shadow-xl flex items-start gap-2.5 animate-fade-in">
          <Sparkles className="w-4 h-4 text-accent-300 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <p className="font-semibold text-accent-300 text-[11px] mb-0.5">Campus Copilot:</p>
            <p className="line-clamp-4">{latestResponse}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isPlayingAudio ? (
              <button
                onClick={stopAudio}
                className="p-1 rounded text-accent-300 hover:text-white"
                title="Pausar voz"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => playVoice(latestResponse)}
                className="p-1 rounded text-stone-400 hover:text-accent-300"
                title="Escuchar respuesta"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => { setLatestResponse(null); stopAudio(); }}
              className="p-1 rounded text-stone-400 hover:text-white"
              title="Cerrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Input Bar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-stone-900/70 backdrop-blur-xl rounded-xl p-1.5 border border-white/[0.1] shadow-lg">
        <div className="pl-2.5 text-accent-400">
          <Sparkles className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntale a tu copiloto..."
          disabled={loading}
          className="flex-1 bg-transparent text-xs text-stone-200 placeholder-stone-500 outline-none px-2 py-1.5 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-lg bg-accent-500 hover:bg-accent-400 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Preguntar"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
}
