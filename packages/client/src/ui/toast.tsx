import { useEffect } from 'react';

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-900/90 text-red-200 rounded-lg text-sm backdrop-blur-sm shadow-lg cursor-pointer animate-[fadeIn_0.2s_ease-out]"
      onClick={onDismiss}
    >
      {message}
    </div>
  );
}
