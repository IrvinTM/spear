import { NextResponse } from 'next/server';
import { generateText } from '@/lib/llm';
import { findCourseForMessage, getGlobalContext, initSchema } from '@/lib/db';
import { getSessionCredentials } from '@/lib/auth-session';
import { getCourseMaterialsDirectory } from '@/lib/materials/storage';
import { logActivity } from '@/lib/activity-log';

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const creds = await getSessionCredentials();
    if (!creds) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { messages, message: maybeMessage } = body;
    const message = maybeMessage || (messages && messages.length > 0 ? messages[messages.length - 1].content : null);
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    initSchema();
    const context = getGlobalContext();
    const course = findCourseForMessage(message);
    const materialsInstruction = course
      ? `El directorio ${getCourseMaterialsDirectory(course.id)} contiene materiales de ${course.fullname}. Inspecciona primero los archivos locales relevantes para responder. Si no encuentras la información localmente, puedes buscar el material o la información en la plataforma del campus usando tus herramientas.`
      : 'No se identificó un curso de forma inequívoca. Si necesitas información adicional o materiales, puedes pedir el nombre del curso o buscar la información en el campus.';

    const conversationHistory = messages 
      ? messages.map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Campus Copilot'}: ${m.content}`).join('\n')
      : `Usuario dice: ${message}`;

    const prompt = `Eres Campus Copilot, el asistente virtual del estudiante.
Usa la siguiente información actual de la base de datos para responder a las preguntas del estudiante.
Si no sabes algo, díselo. Responde de forma natural y profesional.
IMPORTANTE: Evita usar símbolos especiales, emojis o formato markdown (como asteriscos) en tu respuesta, ya que el texto será leído por un motor de texto a voz y los símbolos se leen literalmente. Solo usa texto plano y puntuación básica.

Tienes acceso a herramientas para consultar información. Puedes leer archivos, listar directorios, buscar en la plataforma del campus y ejecutar comandos.
Si necesitas obtener información de una imagen o un archivo PDF, puedes ejecutar el comando \`npx tsx src/bin/read-doc.ts <ruta-al-archivo>\` para extraer su contenido.
Si necesitas más información sobre la base de datos, puedes consultar la base de datos SQLite \`spear.db\` usando el comando sqlite3 (operaciones de solo lectura). Si te falta información, búscala en el sistema del campus.

Contexto Actual:
${context}

${materialsInstruction}

Historial de conversación:
${conversationHistory}
Respuesta de Campus Copilot (concisa y directa):`;

    const aiResponse = await generateText(prompt, {
      timeout: 120000,
      additionalDirectories: course ? [getCourseMaterialsDirectory(course.id)] : undefined,
    });

    logActivity({ category: 'chat', message: 'Chat request completed', method: 'POST', url: req.url, durationMs: Date.now() - startedAt, details: { courseId: course?.id ?? null } });

    return NextResponse.json({ text: aiResponse });
  } catch (error: unknown) {
    console.error('Chat API Error:', error);
    logActivity({ category: 'chat', level: 'error', message: error instanceof Error ? error.message : 'Chat request failed', method: 'POST', url: req.url, durationMs: Date.now() - startedAt });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
