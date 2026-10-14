import { useEffect } from 'react';

interface Props {
  message: string | null;
  onClose: () => void;
  /** Автозакрытие, мс. 0 — не закрывать автоматически. */
  autoCloseMs?: number;
}

export function ErrorToast({ message, onClose, autoCloseMs = 6000 }: Props) {
  useEffect(() => {
    if (!message || autoCloseMs === 0) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [message, autoCloseMs, onClose]);

  if (!message) return null;

  return (
    <div className="error-toast" role="alert">
      <span className="error-toast-icon">⚠</span>
      <span className="error-toast-text">{message}</span>
      <button
        type="button"
        className="error-toast-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ✕
      </button>
    </div>
  );
}