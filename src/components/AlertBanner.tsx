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
      <div className="mb-6 p-4 bg-danger/10 border border-danger/25 rounded-xl flex items-start gap-3">
        <span className="text-danger mt-0.5">&#x274C;</span>
        <div>
          {title && <p className="font-medium text-danger">{title}</p>}
          <p className="text-sm text-danger/80 mt-1">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 p-4 rounded-lg bg-success/10 border border-success/25 text-sm text-success">
      &#x2705; {message}
    </div>
  );
}
