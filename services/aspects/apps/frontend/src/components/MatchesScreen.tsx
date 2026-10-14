import { useMemo } from 'react';
import type { MatchSummaryDto } from '@aspects/shared';
import type { AuthState } from '../game/useAuth';
import { AuthBadge } from './AuthBadge';
import { useOpenProfile } from '../game/profileModal';

interface Props {
  auth: AuthState;
  matches: MatchSummaryDto[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenReplay: (matchId: string) => void;
  onReload: () => void;
}

export function MatchesScreen({
  auth,
  matches,
  loading,
  error,
  onBack,
  onOpenReplay,
  onReload,
}: Props) {
  const sorted = useMemo(
    () => [...matches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [matches],
  );

  if (auth.kind !== 'authenticated') {
    return (
      <div className="page-screen">
        <div className="page-card page-card-narrow">
          <div className="page-header">
            <button className="page-header-back" onClick={onBack}>
              ← Профиль
            </button>
            <h1 className="page-header-title">История матчей</h1>
            <div className="page-header-actions">
              <AuthBadge auth={auth} />
            </div>
          </div>
          <div className="page-empty">
            <div className="page-empty-icon">🔒</div>
            <div className="page-empty-text">
              История матчей сохраняется только для игроков, вошедших через
              Discord.
            </div>
            <div className="page-empty-hint">
              Анонимные партии не записываются на сервер.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-screen">
      <div className="page-card">
        <div className="page-header">
          <button className="page-header-back" onClick={onBack}>
            ← Профиль
          </button>
          <h1 className="page-header-title">История матчей</h1>
          <div className="page-header-actions">
            <AuthBadge auth={auth} />
            <button
              className="btn-header"
              onClick={onReload}
              title="Обновить"
            >
              🔄
            </button>
          </div>
        </div>

        {error && <div className="decks-error">Ошибка загрузки: {error}</div>}
        {loading && <div className="decks-loading">Загрузка…</div>}

        {!loading && sorted.length === 0 && (
          <div className="page-empty">
            <div className="page-empty-icon">📭</div>
            <div className="page-empty-text">
              Ещё не сыграно ни одной партии
            </div>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="match-cards-list">
            {sorted.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onClick={() => onOpenReplay(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  onClick,
}: {
  match: MatchSummaryDto;
  onClick: () => void;
}) {
  const started = new Date(match.startedAt);
  const dateText = started.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const durationMin = Math.floor(match.durationMs / 60000);
  const durationSec = Math.floor((match.durationMs % 60000) / 1000);
  const durationText =
    durationMin > 0 ? `${durationMin}м ${durationSec}с` : `${durationSec}с`;

  const winnerName =
    match.winnerId === 'p1'
      ? match.player1Name
      : match.winnerId === 'p2'
        ? match.player2Name
        : null;

  const reasonText =
    match.winnerReason === 'glory_zero'
      ? 'по Величию'
      : match.winnerReason === 'alt_victory'
        ? 'по нейтралам'
        : null;
  
  const openProfile = useOpenProfile();
  const p1Clickable =
    !!match.player1Id && !match.player1Id.startsWith('anon:') && !match.p1BotName;
  const p2Clickable =
    !!match.player2Id && !match.player2Id.startsWith('anon:') && !match.p2BotName;

  return (
    <div className="match-card" onClick={onClick}>
      <div className="match-card-side match-card-side-p1">
        <div
          className={`match-card-name ${p1Clickable ? 'match-card-name-clickable' : ''}`}
          onClick={
            p1Clickable
              ? (e) => {
                  e.stopPropagation();
                  openProfile(match.player1Id!);
                }
              : undefined
          }
        >
          {match.player1Name}
          {match.p1BotName && <span className="match-card-bot"> 🤖</span>}
        </div>
        {match.winnerId === 'p1' && <span className="match-card-winner">🏆</span>}
      </div>

      <div className="match-card-mid">
        <div className="match-card-date">{dateText}</div>
        <div className="match-card-meta">
          {match.turnNumber} ходов · {durationText}
        </div>
        {winnerName && reasonText && (
          <div className="match-card-result">
            {winnerName} · {reasonText}
          </div>
        )}
      </div>

      <div className="match-card-side match-card-side-p2">
        <div
          className={`match-card-name ${p2Clickable ? 'match-card-name-clickable' : ''}`}
          onClick={
            p2Clickable
              ? (e) => {
                  e.stopPropagation();
                  openProfile(match.player2Id!);
                }
              : undefined
          }
        >
          {match.player2Name}
          {match.p2BotName && <span className="match-card-bot"> 🤖</span>}
        </div>
        {match.winnerId === 'p2' && <span className="match-card-winner">🏆</span>}
      </div>
    </div>
  );
}