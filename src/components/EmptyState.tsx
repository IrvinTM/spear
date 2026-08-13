export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-stone-400 max-w-xs mx-auto mb-6">
        {description}
      </p>
    </div>
  );
}
