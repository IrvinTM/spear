import { NextResponse } from 'next/server';
import { generateText } from '@/lib/llm';
import { getGlobalContext, initSchema } from '@/lib/db';
import { classifyIntent } from '@/lib/chat-router';
import { logActivity } from '@/lib/activity-log';

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const { messages, message: maybeMessage } = body;
    const message = maybeMessage || (messages && messages.length > 0 ? messages[messages.length - 1].content : null);
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    initSchema();

    const conversationHistory = messages
      ? messages.map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Campus Copilot'}: ${m.content}`).join('\n')
      : `Usuario dice: ${message}`;

    const intent = await classifyIntent(message, conversationHistory);

    const context = getGlobalContext();

    const hasContent = intent.preloadedContent.length > 0;

    const prompt = `Eres Campus Copilot, el asistente virtual del estudiante.
Responde de forma concisa y directa. Si no sabes algo, díselo.
IMPORTANTE: No uses emojis, markdown ni símbolos especiales. Solo texto plano y puntuación básica (el texto será leído por TTS).
${hasContent ? 'IMPORTANTE: La información de los documentos relevantes ya está incluida abajo. Responde usando esa información directamente, NO necesitas leer archivos ni usar herramientas.' : ''}

${intent.materialsContext}

Contexto general del estudiante:
${context}
${hasContent ? `\nContenido de documentos relevantes:\n${intent.preloadedContent}` : ''}

Historial de conversación:
${conversationHistory}
Respuesta de Campus Copilot:`;

    const additionalDirectories: string[] = [];
    if (!hasContent && intent.directoryHint) additionalDirectories.push(intent.directoryHint);

    const aiResponse = await generateText(prompt, {
      timeout: hasContent ? 30_000 : 90_000,
      additionalDirectories: additionalDirectories.length > 0 ? additionalDirectories : undefined,
    });

    logActivity({
      category: 'chat',
      message: 'Chat request completed',
      method: 'POST',
      url: req.url,
      durationMs: Date.now() - startedAt,
      details: { courseId: intent.courseId, routed: !!intent.directoryHint, filesHinted: intent.relevantFiles.length },
    });

    return NextResponse.json({ text: aiResponse });
  } catch (error: unknown) {
    console.error('Chat API Error:', error);
    logActivity({ category: 'chat', level: 'error', message: error instanceof Error ? error.message : 'Chat request failed', method: 'POST', url: req.url, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
