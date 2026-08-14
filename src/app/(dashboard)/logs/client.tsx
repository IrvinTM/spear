'use client';

import { useState } from 'react';
import { LiveActivity } from '@/components/LiveActivity';

export function LiveToggle() {
  const [live, setLive] = useState(false);

  return (
    <>
      <button
        onClick={() => setLive((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
          live
            ? 'bg-accent-600 text-white border-accent-700'
            : 'bg-stone-800 text-stone-400 border-white/[0.06] hover:bg-stone-700 hover:text-stone-200'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-white animate-pulse' : 'bg-stone-500'}`} />
        {live ? 'Live' : 'Go live'}
      </button>

      {live && (
        <div className="mt-4 bg-stone-900 border border-white/[0.06] rounded-xl h-[400px] overflow-hidden">
          <LiveActivity />
        </div>
      )}
    </>
  );
}
