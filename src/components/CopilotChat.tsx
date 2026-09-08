'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, AudioLines, Volume2, Pause, Download, Trash2 } from 'lucide-react';
import { playThinkingCue, playCompleteCue, playErrorCue } from '@/lib/client/audio-cues';

type Message = { role: 'user' | 'assistant'; content: string };

const DEFAULT_MESSAGES: Message[] = [
  { role: 'assistant', content: '¡Hola! Soy Campus Copilot. ¿En qué te ayudo hoy?' }
];

export function CopilotChat({ expanded = true }: { expanded?: boolean }) {
  const [messages, setMessages] = useState<Message[]>(DEFAULT_MESSAGES);
  const isHydratedRef = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('spear_chat_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {}
    isHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    try {
      localStorage.setItem('spear_chat_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    const handleExternalMessage = (e: Event) => {
      const customEvent = e as CustomEvent<{ user: string; assistant: string }>;
      if (customEvent.detail) {
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: customEvent.detail.user },
          { role: 'assistant', content: customEvent.detail.assistant },
        ]);
      }
    };
    window.addEventListener('copilot:external-message', handleExternalMessage);
    return () => window.removeEventListener('copilot:external-message', handleExternalMessage);
  }, []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [cachedAudioIndices, setCachedAudioIndices] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      cache.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsTalking(false);
    setPlayingIndex(null);
    window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
  }, []);

  const playAudioBlob = useCallback((blobUrl: string, messageIndex: number) => {
    stopAudio();
    const audio = new Audio(blobUrl);
    audioRef.current = audio;
    audio.onplay = () => {
      setIsTalking(true);
      setPlayingIndex(messageIndex);
      window.dispatchEvent(new CustomEvent('character-pose', { detail: 'speaking' }));
    };
    audio.onended = () => {
      setIsTalking(false);
      setPlayingIndex(null);
      window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
    };
    audio.onerror = () => {
      setIsTalking(false);
      setPlayingIndex(null);
      window.dispatchEvent(new CustomEvent('character-pose', { detail: 'idle' }));
    };
    audio.play().catch(console.error);
  }, [stopAudio]);

  const fetchAndPlayAudio = useCallback(async (text: string, messageIndex: number) => {
    const cached = audioCacheRef.current.get(messageIndex);
    if (cached) {
      playAudioBlob(cached, messageIndex);
      return;
    }

    setIsAudioLoading(true);
    try {
      const res = await fetch('/api/chat/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        console.warn('Audio fetch failed, server returned', res.status);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioCacheRef.current.set(messageIndex, url);
      setCachedAudioIndices(prev => new Set(prev).add(messageIndex));
      playAudioBlob(url, messageIndex);
    } catch (err) {
      console.warn('TTS Error:', err);
    } finally {
      setIsAudioLoading(false);
    }
  }, [playAudioBlob]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);
    playThinkingCue();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      if (data.text) {
        playCompleteCue();
        const assistantIndex = newMessages.length;
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
        fetchAndPlayAudio(data.text, assistantIndex);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error.' }]);
      }
    } catch {
      playErrorCue();
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }]);
    }

    setIsLoading(false);
  };

  const handleReplay = (index: number) => {
    if (playingIndex === index) {
      stopAudio();
      return;
    }
    const msg = messages[index];
    if (msg?.role === 'assistant') {
      fetchAndPlayAudio(msg.content, index);
    }
  };

  const handleDownload = (index: number) => {
    const url = audioCacheRef.current.get(index);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `copilot-${index}.wav`;
    a.click();
  };

  const handleClearChat = () => {
    stopAudio();
    setMessages(DEFAULT_MESSAGES);
    try {
      localStorage.removeItem('spear_chat_history');
    } catch {}
  };

  const statusText = isTalking ? 'Hablando...' : isAudioLoading ? 'Preparando voz...' : isLoading ? 'Pensando...' : 'En línea';

  return (
    <div className="bg-transparent flex flex-col h-full overflow-hidden">
      {expanded && (
        <>
          {/* Header */}
          <div className="p-4 border-b border-accent-500/10 flex items-center justify-between bg-stone-950/40">
            <div className="flex items-center gap-4">
              <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0 bg-stone-950/60 transition-colors duration-300 ${isTalking ? 'border-pale-400 shadow-[0_0_15px_rgba(166,172,205,0.3)]' : 'border-pale-600/40'}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {isTalking ? <AudioLines className="w-6 h-6 text-pale-300 animate-pulse" /> : <Bot className="w-6 h-6 text-stone-400" />}
                </div>
              </div>
              <div>
                <h2 className="font-semibold text-stone-100 text-sm">Assistant Chat</h2>
                <p className="text-xs text-pale-400 font-medium">{statusText}</p>
              </div>
            </div>
            <button
              onClick={handleClearChat}
              className="text-stone-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-stone-800/60 transition-colors"
              title="Borrar historial"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 scroll-smooth">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[80%] rounded-xl p-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-pale-800/80 text-pale-300 self-end rounded-br-none border border-pale-600/30'
                    : 'bg-stone-950/60 text-stone-200 self-start rounded-bl-none border border-pale-700/40'
                }`}
              >
                {msg.content}
                {msg.role === 'assistant' && i > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleReplay(i)}
                      disabled={isAudioLoading && playingIndex !== i}
                      className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors cursor-pointer disabled:opacity-40 ${
                        playingIndex === i
                          ? 'text-pale-300 bg-pale-600/20'
                          : 'text-stone-500 hover:text-stone-300 hover:bg-white/[0.04]'
                      }`}
                      title={playingIndex === i ? 'Pausar' : 'Reproducir'}
                    >
                      {isAudioLoading && playingIndex === null && !cachedAudioIndices.has(i)
                        ? <span className="spinner spinner--sm" />
                        : playingIndex === i ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    {cachedAudioIndices.has(i) && (
                      <button
                        onClick={() => handleDownload(i)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
                        title="Descargar audio"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Input bar — always visible */}
      <form onSubmit={handleSend} className={`p-3 bg-stone-950/40 ${expanded ? 'border-t border-accent-500/10' : ''} flex gap-2 items-center`}>
        {!expanded && (
          <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-colors ${isTalking || isLoading ? 'border-pale-400 bg-pale-600/20' : 'border-pale-600/40 bg-stone-950/60'}`}>
            {isTalking ? <AudioLines className="w-4 h-4 text-pale-300 animate-pulse" /> : isLoading ? <span className="spinner spinner--sm" /> : <Bot className="w-4 h-4 text-stone-400" />}
          </div>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={expanded ? 'Pregúntame algo sobre tus cursos...' : 'Pregúntale al Copilot...'}
          className="flex-1 bg-stone-950/60 border border-pale-700/40 rounded-lg px-4 py-2 text-sm text-stone-200 focus:outline-none focus:border-pale-500/50 focus:shadow-[0_0_8px_rgba(166,172,205,0.1)] transition-all"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-pale-800 hover:bg-pale-700 disabled:opacity-50 disabled:hover:bg-pale-800 text-pale-300 px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer border border-pale-600/40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
