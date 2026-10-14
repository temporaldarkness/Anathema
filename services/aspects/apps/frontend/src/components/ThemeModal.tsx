import { useEffect } from 'react';
import type { ThemeMeta } from '../game/themeLoader';

interface Props {
  open: boolean;
  themes: ThemeMeta[];
  current: string;
  loading: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function ThemeModal({
  open,
  themes,
  current,
  loading,
  onSelect,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="theme-modal-overlay" onClick={onClose}>
      <div className="theme-modal" onClick={(e) => e.stopPropagation()}>
        <div className="theme-modal-header">
          <h2 className="theme-modal-title">Темы оформления</h2>
          <button
            className="theme-modal-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="theme-modal-body">
          {loading && (
            <div className="theme-modal-loading">Загрузка тем…</div>
          )}
          {!loading &&
            themes.map((t) => {
              const active = t.id === current;
              return (
                <button
                  key={t.id}
                  className={`theme-tile ${active ? 'theme-tile-active' : ''}`}
                  onClick={() => onSelect(t.id)}
                >
                  <div
                    className="theme-tile-preview"
                    style={{ background: t.preview.bg }}
                  >
                    {/* Шапка окна */}
                    <div
                      className="theme-tile-preview-chrome"
                      style={{ background: t.preview.card }}
                    >
                      <span
                        className="theme-tile-preview-dot"
                        style={{ background: t.preview.danger }}
                      />
                      <span
                        className="theme-tile-preview-dot"
                        style={{ background: t.preview.warning }}
                      />
                      <span
                        className="theme-tile-preview-dot"
                        style={{ background: t.preview.success }}
                      />
                    </div>

                    {/* Контент */}
                    <div className="theme-tile-preview-content">
                      <div className="theme-tile-preview-cards">
                        <div
                          className="theme-tile-preview-mini-card"
                          style={{
                            background: t.preview.card,
                            borderTop: `3px solid ${t.preview.accent}`,
                          }}
                        >
                          <div
                            className="theme-tile-preview-line"
                            style={{ background: t.preview.text }}
                          />
                          <div
                            className="theme-tile-preview-line theme-tile-preview-line-short"
                            style={{ background: t.preview.textSoft }}
                          />
                        </div>
                        <div
                          className="theme-tile-preview-mini-card"
                          style={{
                            background: t.preview.card,
                            borderTop: `3px solid ${t.preview.title}`,
                          }}
                        >
                          <div
                            className="theme-tile-preview-line"
                            style={{ background: t.preview.text }}
                          />
                          <div
                            className="theme-tile-preview-line theme-tile-preview-line-short"
                            style={{ background: t.preview.textSoft }}
                          />
                        </div>
                      </div>

                      {/* Кнопка */}
                      <div
                        className="theme-tile-preview-btn"
                        style={{ background: t.preview.accent }}
                      />
                    </div>
                  </div>

                  <div className="theme-tile-header">
                    <div className="theme-tile-name">{t.name}</div>
                    <div className="theme-tile-mode">
                      {t.light ? '☀ День' : '🌙 Ночь'}
                    </div>
                  </div>
                  <div className="theme-tile-desc">{t.description}</div>
                  {active && <div className="theme-tile-active-mark">✓</div>}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}