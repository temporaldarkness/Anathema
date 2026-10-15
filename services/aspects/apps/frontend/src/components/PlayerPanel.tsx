import type { GameState } from '@aspects/engine';
import type { Floating } from '../game/floatings';
import { FloatingLayer } from './FloatingLayer';

interface Props {
  state: GameState;
  playerId: 'p1' | 'p2';
  isActive: boolean;
  isBot?: boolean;
  botThinking?: boolean;
  observe?: boolean;
  handCountOverride?: number | null;
  displayName?: string | null;
  /** Floating-числа, привязанные к панели (урон по гильдии). */
  floatings?: Floating[];
}

export function PlayerPanel({
  state,
  playerId,
  isActive,
  isBot,
  botThinking,
  observe,
  handCountOverride,
  displayName,
  floatings,
}: Props) {
  const p = state.players[playerId];
  const classes = [
    'player-panel',
    `player-panel-${playerId}`,
    isActive ? 'player-panel-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <FloatingLayer items={floatings} />
      <div className="player-panel-name">
        <span className="player-panel-display-name">
          {displayName || playerId.toUpperCase()}
        </span>
        {displayName && (
          <span className="player-panel-side-tag">
            {playerId.toUpperCase()}
          </span>
        )}
        {isActive && (
          <span className="player-panel-active-badge">активен</span>
        )}
        {isBot && <span className="player-panel-bot-badge">🤖 БОТ</span>}
        {botThinking && (
          <span className="player-panel-thinking-badge">● думает</span>
        )}
      </div>
      <div className="player-panel-stats">
        <div>Величие: <b>{p.glory}</b></div>
        <div>Влияние: <b>{p.influence}</b></div>
        <div>
          Рука: <b>{handCountOverride ?? p.hand.length}</b>
        </div>
        <div>Колода: <b>{p.deck.length}</b></div>
        <div>Сброс: <b>{p.discard.length}</b></div>
      </div>
    </div>
  );
}