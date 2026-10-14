import { createPortal } from 'react-dom';
import { useEffect } from 'react';

export interface ConfirmDialogState {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface Props {
  state: ConfirmDialogState | null;
  onClose: () => void;
}

export function ConfirmDialog({ state, onClose }: Props) {
  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') {
        state.onConfirm();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, onClose]);

  if (!state) return null;

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{state.title}</div>
        {state.message && (
          <div className="confirm-message">{state.message}</div>
        )}
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={onClose}>
            {state.cancelLabel ?? 'Отмена'}
          </button>
          <button
            className={`confirm-btn confirm-btn-primary ${
              state.danger ? 'confirm-btn-danger' : ''
            }`}
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
          >
            {state.confirmLabel ?? 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}