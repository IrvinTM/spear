import { NextResponse } from 'next/server';
import { generateText } from '@/lib/llm';
import { getGlobalContext } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    const context = getGlobalContext();

    const prompt = `Eres Campus Copilot, el asistente virtual del estudiante.
Usa la siguiente información actual de la base de datos para responder a las preguntas del estudiante.
Si no sabes algo, díselo. Responde de forma natural, como un personaje anime amable.

Contexto Actual:
${context}

Usuario dice: ${message}
Respuesta de Campus Copilot (concisa y directa):`;

    const aiResponse = await generateText(prompt, { timeout: 30000 });

    let audioBase64 = '';
    try {
      const { generateAudio } = await import('@/lib/tts');
      const audioBuffer = await generateAudio(aiResponse);
      audioBase64 = audioBuffer.toString('base64');
    } catch (ttsErr) {
      console.error('TTS Error:', ttsErr);
    }

    return NextResponse.json({ text: aiResponse, audio: audioBase64 });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
