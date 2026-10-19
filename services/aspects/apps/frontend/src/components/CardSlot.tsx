import type { GameState, CardInstanceId } from '@aspects/engine';
import { HoverTooltip } from './HoverTooltip';
import { CardTooltip } from './CardTooltip';
import type { Floating } from '../game/floatings';

interface Props {
  state: GameState;
  cardId: CardInstanceId | null;
  ownerPlayer: 'p1' | 'p2';
  zone: 'FRONT' | 'RESERVE';
  column: number;
  isActive: boolean;
  onClick?: () => void;
  highlight?: 'none' | 'target' | 'source';
  playable?: boolean;
  floating?: Floating[];
  replaceCost?: number;
}

function FloatingLayer({ items }: { items: Floating[] }) {
  return (
    <div className="floating-layer">
      {items.map((a, i) => (
        <div
          key={a.id}
          className="floating-num"
          style={{ color: a.color, animationDelay: `${i * 60}ms` }}
        >
          {a.text}
        </div>
      ))}
    </div>
  );
}

export function CardSlot({
  state,
  cardId,
  ownerPlayer,
  zone,
  isActive,
  onClick,
  highlight = 'none',
  playable = false,
  floating,
  replaceCost,
}: Props) {
  const baseClasses = [
    'slot',
    `slot-${zone.toLowerCase()}`,
    `slot-owner-${ownerPlayer}`,
    isActive ? 'slot-active' : '',
    highlight !== 'none' ? `slot-${highlight}` : '',
    onClick ? 'slot-clickable' : '',
    playable ? 'slot-playable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!cardId) {
    return (
      <div className={`${baseClasses} slot-empty`} onClick={onClick}>
        {floating && floating.length > 0 && <FloatingLayer items={floating} />}
        —
      </div>
    );
  }

  const card = state.cards[cardId];
  const def = state.definitions[card.definitionId];
  const silenced = card.silenced;

  // Silence снимает все keywords и триггеры.
  const abilities = silenced ? [] : (def?.abilities ?? []);

  let strength = card.baseStrength;
  let hp = card.baseHealth - card.damageTaken;
  for (const m of card.modifiers) {
    if (m.stat === 'strength') strength += m.delta;
    if (m.stat === 'health') hp += m.delta;
  }
  const ownerControlsCol2 = state.board[1].neutralOwner === ownerPlayer;
  if (zone === 'FRONT' && ownerControlsCol2) strength += 1;
  strength = Math.max(0, strength);

  const ownerControlsCol4 = state.board[3].neutralOwner === ownerPlayer;
  const hasDefense = zone === 'FRONT' && ownerControlsCol4;

  const flags: string[] = [];
  if (card.isToken) flags.push('T');
  if (card.shieldAvailable) flags.push('S');
  if (card.slowCounter > 0) flags.push('~');
  if (abilities.includes('armored')) flags.push('B');
  if (abilities.includes('regenerate')) flags.push('R');
  if (abilities.includes('cleave')) flags.push('C');

  const isFrenzy = abilities.includes('frenzy');
  const maxAttacks = isFrenzy ? 2 : 1;
  const attacksLeft = Math.max(0, maxAttacks - card.attacksThisTurn);
  const showFrenzyBadge = isFrenzy && zone === 'FRONT';

  const classes = [
    ...baseClasses.split(' '),
    hp <= 0 ? 'slot-dead' : '',
    hasDefense ? 'slot-defended' : '',
    `slot-rarity-${def.rarity}`,
    card.exhausted ? 'slot-exhausted' : '',
    silenced ? 'slot-silenced' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <HoverTooltip
      className={classes}
      content={<CardTooltip state={state} cardId={cardId} />}
      onClick={onClick}
    >
      {floating && floating.length > 0 && <FloatingLayer items={floating} />}
      {silenced && (
        <div className="slot-silenced-mark" title="Способности сняты">
          🔇
        </div>
      )}
      {showFrenzyBadge && (
        <div
          className="slot-frenzy-badge"
          title={`Атак осталось: ${attacksLeft} из ${maxAttacks}`}
        >
          ⚡ {attacksLeft}/{maxAttacks}
        </div>
      )}
	  {replaceCost !== undefined && (
        <div className="slot-replace-cost" title="Стоимость замены">
          ↻ {replaceCost}💰
        </div>
      )}
      <div className="slot-name">{def?.name ?? card.definitionId}</div>
      <div className="slot-stats">
        <span className="stat stat-str" title="Сила">⚔{strength}</span>
        <span className="stat stat-hp" title="Здоровье">❤{hp}</span>
        {hasDefense && <span className="stat stat-def" title="Защита колонки 4">🛡</span>}
        {flags.length > 0 && <span className="slot-flags">[{flags.join('')}]</span>}
      </div>
    </HoverTooltip>
  );
}