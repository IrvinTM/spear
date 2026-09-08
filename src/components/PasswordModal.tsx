'use client';

import { useState } from 'react';

export function PasswordModal({
  title = 'Unlock vault',
  description = 'Enter your master password to continue.',
  submitLabel = 'Unlock & sync',
  onSubmit,
  onCancel,
}: {
  title?: string;
  description?: string;
  submitLabel?: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (password) {
      onSubmit(password);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-stone-900/95 border border-white/[0.1] rounded-2xl p-8 shadow-2xl backdrop-blur-xl w-full max-w-sm animate-slide-up">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-stone-400 mb-6">{description}</p>
        <input
          type="password"
          placeholder="Master password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
          className="w-full px-4 py-3 rounded-lg bg-stone-950 border border-white/10 text-stone-50 text-base outline-none placeholder:text-stone-500 transition-all focus:border-accent-400/60 focus:ring-2 focus:ring-accent-500/25 mb-4"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.06] text-stone-100 text-sm font-medium border border-white/[0.1] hover:bg-white/[0.1] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 rounded-lg bg-accent-500 text-white text-sm font-medium hover:bg-accent-400 transition-all cursor-pointer"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
