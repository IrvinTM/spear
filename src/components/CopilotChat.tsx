'use client';

import { useState, useRef, useEffect } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };

export function CopilotChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola! Soy Campus Copilot. ¿En qué te ayudo hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);

        // Fetch audio separately so text appears immediately
        setIsAudioLoading(true);
        fetch('/api/chat/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.text }),
        })
          .then(audioRes => {
            if (!audioRes.ok) throw new Error('Audio fetch failed');
            return audioRes.blob();
          })
          .then(blob => {
            const url = URL.createObjectURL(blob);
            if (audioRef.current) {
              audioRef.current.pause();
            }
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onplay = () => setIsTalking(true);
            audio.onended = () => {
              setIsTalking(false);
              URL.revokeObjectURL(url);
            };
            audio.onerror = () => {
              setIsTalking(false);
              URL.revokeObjectURL(url);
            };
            audio.play().catch(console.error);
          })
          .catch(err => console.error('TTS Error:', err))
          .finally(() => setIsAudioLoading(false));
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error.' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }]);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="bg-stone-900 border border-white/[0.06] rounded-xl flex flex-col h-[500px] shadow-lg overflow-hidden">
      
      {/* Header y Avatar */}
      <div className="p-4 border-b border-white/[0.06] flex items-center gap-4 bg-stone-950/50">
        <div className={`relative w-16 h-16 rounded-full overflow-hidden border-2 flex-shrink-0 bg-stone-800 transition-colors duration-300 ${isTalking ? 'border-accent-400 shadow-[0_0_15px_rgba(var(--accent-500),0.5)]' : 'border-stone-600'}`}>
          <div className="absolute inset-0 flex items-center justify-center text-3xl transition-transform duration-200">
            {isTalking ? <span className="animate-pulse">🗣️</span> : <span>🤖</span>}
          </div>
        </div>
        <div>
          <h2 className="font-semibold text-stone-200">Campus Copilot</h2>
          <p className="text-xs text-accent-400 font-medium">
            {isTalking ? 'Hablando...' : isAudioLoading ? 'Preparando voz...' : isLoading ? 'Pensando...' : 'En línea'}
          </p>
        </div>
      </div>

      {/* Área de chat */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 scroll-smooth"
      >
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`max-w-[80%] rounded-xl p-3 text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-accent-600 text-white self-end rounded-br-none' 
                : 'bg-stone-800 text-stone-200 self-start rounded-bl-none border border-white/[0.04]'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="p-3 bg-stone-950/50 border-t border-white/[0.06] flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregúntame algo sobre tus cursos..."
          className="flex-1 bg-stone-900 border border-white/[0.06] rounded-lg px-4 py-2 text-sm text-stone-200 focus:outline-none focus:border-accent-500 transition-colors"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:hover:bg-accent-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
