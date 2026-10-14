import { useState } from 'react';
import { getAnonName, setAnonName } from '../game/anonId';

interface Props {
  open: boolean;
  onConfirm: (name: string) => void;
}

export function AnonNameModal({ open, onConfirm }: Props) {
  const [name, setName] = useState(getAnonName() ?? '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setAnonName(trimmed);
    try {
      await fetch('/games/aspects/api/session/name', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch (e) {
      console.warn('[anon-name] sync failed', e);
    } finally {
      setSaving(false);
      onConfirm(trimmed);
    }
  };

  return (
    <div className="anon-modal-overlay">
      <div className="anon-modal">
        <div className="anon-modal-title">Как вас называть?</div>
        <div className="anon-modal-desc">Имя будет видно сопернику.</div>
        <input
          className="anon-modal-input"
          placeholder="Ваше имя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          autoFocus
          disabled={saving}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        />
        <button
          className="anon-modal-btn"
          disabled={!name.trim() || saving}
          onClick={handleConfirm}
        >
          {saving ? 'Сохраняем…' : 'Продолжить'}
        </button>
      </div>
    </div>
  );
}