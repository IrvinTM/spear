export function AlertBanner({
  variant,
  message,
  title,
}: {
  variant: 'error' | 'success';
  message: string;
  title?: string;
}) {
  if (variant === 'error') {
    return (
      <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
        <span className="text-red-400 mt-0.5">&#x274C;</span>
        <div>
          {title && <p className="font-medium text-red-200">{title}</p>}
          <p className="text-sm text-red-400/80 mt-1">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 p-4 rounded-lg bg-success/[0.08] border border-success/20 text-sm text-green-300">
      &#x2705; {message}
    </div>
  );
}
