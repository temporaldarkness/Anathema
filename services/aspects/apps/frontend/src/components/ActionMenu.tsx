export interface ActionOption {
  label: string;
  onSelect: () => void;
  variant?: 'primary' | 'danger';
}

interface Props {
  title: string;
  subtitle?: string;
  options: ActionOption[];
  onCancel: () => void;
}

export function ActionMenu({ title, subtitle, options, onCancel }: Props) {
  return (
    <div className="action-menu-overlay" onClick={onCancel}>
      <div className="action-menu" onClick={(e) => e.stopPropagation()}>
        <div className="action-menu-title">{title}</div>
        {subtitle && <div className="action-menu-subtitle">{subtitle}</div>}
        <div className="action-menu-list">
          {options.map((o, i) => (
            <button
              key={i}
              className={`action-menu-btn ${o.variant === 'danger' ? 'action-menu-btn-danger' : ''}`}
              onClick={() => {
                o.onSelect();
                onCancel();
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="action-menu-footer">
          <button className="action-menu-cancel" onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}