import type { AuthState } from '../game/useAuth';

interface Props {
  auth: AuthState;
}

export function AuthBadge({ auth }: Props) {
  if (auth.kind === 'loading') {
    return <span className="auth-badge auth-badge-loading">···</span>;
  }

  if (auth.kind === 'authenticated') {
    const initial = auth.user.username?.[0]?.toUpperCase() ?? '👤';
    return (
      <span
        className="auth-badge auth-badge-user"
        title={auth.user.isAdmin ? 'Администратор' : undefined}
      >
        <span className="auth-badge-avatar">
          {auth.user.avatarUrl ? (
            <img src={auth.user.avatarUrl} alt="" />
          ) : (
            initial
          )}
        </span>
        <span className="auth-badge-name">{auth.user.username}</span>
        {auth.user.isAdmin && <span className="auth-badge-crown">👑</span>}
      </span>
    );
  }

  const name = auth.anonName?.trim() || 'Аноним';
  return (
    <span
      className="auth-badge auth-badge-anon"
      title="Анонимный режим: колоды сохраняются только локально"
    >
      <span className="auth-badge-avatar">👤</span>
      <span className="auth-badge-name">{name}</span>
    </span>
  );
}