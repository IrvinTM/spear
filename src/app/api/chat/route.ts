import { NextResponse } from 'next/server';
import { generateText } from '@/lib/llm';
import { getGlobalContext } from '@/lib/db';
import { getSessionCredentials } from '@/lib/auth-session';

export async function POST(req: Request) {
  try {
    const creds = await getSessionCredentials();
    if (!creds) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    return NextResponse.json({ text: aiResponse });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
