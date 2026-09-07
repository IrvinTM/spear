import React from 'react';

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center py-20">
      {icon && <div className="flex justify-center mb-4 text-stone-500 opacity-60">{icon}</div>}
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-stone-400 max-w-xs mx-auto mb-6">
        {description}
      </p>
    </div>
  );
}
