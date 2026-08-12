'use client';

import { useState } from 'react';
import { generateAiSummary } from './actions';

export function CourseSummaryClient({ courseId, rawSummary }: { courseId: number; rawSummary: string }) {
  const [summary, setSummary] = useState<string>(rawSummary && rawSummary.startsWith('Secciones:') ? '' : rawSummary);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    const result = await generateAiSummary(courseId, rawSummary);
    if (result.success && result.text) {
      setSummary(result.text);
    } else {
      setError(result.error || 'Failed to generate summary');
    }
    setIsLoading(false);
  };

  const isRaw = !summary && rawSummary && rawSummary.startsWith('Secciones:');

  return (
    <details className="mb-4 group">
      <summary className="cursor-pointer text-sm font-medium text-accent-400 hover:text-accent-300 list-none flex items-center gap-2">
        <span className="w-4 h-4 inline-flex items-center justify-center bg-accent-500/10 rounded group-open:rotate-90 transition-transform">
          ▶
        </span>
        Ver resumen
      </summary>
      <div className="mt-3 p-4 bg-stone-950/50 rounded-lg border border-white/[0.04] text-sm text-stone-300 leading-relaxed">
        {summary ? (
          <div className="whitespace-pre-wrap">{summary}</div>
        ) : isRaw ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-stone-400 text-xs italic">El resumen aún no ha sido generado por IA.</p>
            <button 
              onClick={handleGenerate}
              disabled={isLoading}
              className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded font-medium transition-colors">
              {isLoading ? 'Generando...' : '✨ Generar Resumen con IA'}
            </button>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        ) : (
          <p className="text-stone-500 italic">No hay información suficiente para generar un resumen.</p>
        )}
      </div>
    </details>
  );
}