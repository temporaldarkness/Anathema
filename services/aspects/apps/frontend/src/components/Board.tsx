import type { GameState, CardInstanceId, ColumnIndex } from '@aspects/engine';
import { CardSlot } from './CardSlot';
import type { Floating } from '../game/floatings';
import { FloatingLayer } from './FloatingLayer';

interface Props {
  state: GameState;
  onSlotClick: (
    column: number,
    owner: 'p1' | 'p2',
    zone: 'FRONT' | 'RESERVE',
    cardId: CardInstanceId | null,
  ) => void;
  onNeutralClick: (column: ColumnIndex) => void;
  onAbilityClick?: (cardId: CardInstanceId) => void; // ← Новое
  highlightTargets: Set<CardInstanceId>;
  highlightSources: Set<CardInstanceId>;
  playMode: boolean;
  attackMode: boolean;
  attackerColumn: ColumnIndex | null;
  floatingsByPos: Map<string, Floating[]>;
  replaceCosts?: Map<CardInstanceId, number>;
  localPlayerId?: 'p1' | 'p2';
}

const NEUTRAL_BONUS: Record<number, string> = {
  1: '−1💰',
  2: '+1⚔',
  3: '+1💧',
  4: '+1🛡',
  5: '+1🃏',
};

const NEUTRAL_FULL: Record<number, string> = {
  1: 'Колонка 1: −1 к стоимости всех карт',
  2: 'Колонка 2: +1 силы всем картам во Фронте',
  3: 'Колонка 3: +1 Влияние в начале хода',
  4: 'Колонка 4: +1 защиты от любого урона',
  5: 'Колонка 5: +1 карта в начале хода',
};

export function Board({
  state,
  onSlotClick,
  onNeutralClick,
  onAbilityClick,
  highlightTargets,
  highlightSources,
  playMode,
  attackMode,
  attackerColumn,
  floatingsByPos,
  replaceCosts,
  localPlayerId,
}: Props) {
  const playerInfluence = state.players[state.activePlayer].influence;
  return (
    <div className="board">
      <div className="board-header">
        <div className="board-col-label">#</div>
        <div className="board-col-label">P1 Резерв</div>
        <div className="board-col-label">P1 Фронт</div>
        <div className="board-col-label">Нейтрал</div>
        <div className="board-col-label">P2 Фронт</div>
        <div className="board-col-label">P2 Резерв</div>
      </div>
      {state.board.map((col, i) => {
        const colNum = (i + 1) as ColumnIndex;
        const isP1Active = state.activePlayer === 'p1';
        const isP2Active = state.activePlayer === 'p2';

        const p1ReservePlayable = playMode && isP1Active && col.p1Reserve === null;
        const p2ReservePlayable = playMode && isP2Active && col.p2Reserve === null;

        const neutralAttackable =
          attackMode &&
          attackerColumn === colNum &&
          col.neutralOwner !== state.activePlayer;

        return (
          <div key={colNum} className="board-row">
            <div className="board-col-label">{colNum}</div>

            <CardSlot
              state={state}
              cardId={col.p1Reserve}
              ownerPlayer="p1"
              zone="RESERVE"
              column={colNum}
              isActive={isP1Active}
              playable={p1ReservePlayable}
              highlight={
                col.p1Reserve && highlightTargets.has(col.p1Reserve) ? 'target' : 'none'
              }
              onClick={() => onSlotClick(colNum, 'p1', 'RESERVE', col.p1Reserve)}
              onAbilityClick={onAbilityClick}
              playerInfluence={playerInfluence}
              floating={floatingsByPos.get(`${colNum}:p1:RESERVE`)}
			  replaceCost={col.p1Reserve ? replaceCosts?.get(col.p1Reserve) : undefined}
			  isMyCard={localPlayerId === "p1"}
            />

            <CardSlot
              state={state}
              cardId={col.p1Front}
              ownerPlayer="p1"
              zone="FRONT"
              column={colNum}
              isActive={isP1Active}
              highlight={
                col.p1Front && highlightSources.has(col.p1Front)
                  ? 'source'
                  : col.p1Front && highlightTargets.has(col.p1Front)
                    ? 'target'
                    : 'none'
              }
              onClick={() => onSlotClick(colNum, 'p1', 'FRONT', col.p1Front)}
              onAbilityClick={onAbilityClick}
              playerInfluence={playerInfluence}
              floating={floatingsByPos.get(`${colNum}:p1:FRONT`)}
			  replaceCost={col.p1Front ? replaceCosts?.get(col.p1Front) : undefined}
			  isMyCard={localPlayerId === "p1"}
            />

            <div
              className={`neutral-slot neutral-${col.neutralOwner ?? 'none'} ${
                neutralAttackable ? 'neutral-attackable' : ''
              }`}
              onClick={neutralAttackable ? () => onNeutralClick(colNum) : undefined}
              title={NEUTRAL_FULL[colNum]}
            >
              <FloatingLayer items={floatingsByPos.get(`${colNum}:neutral:FRONT`) ?? []} />
              <div className="neutral-owner">
                {col.neutralOwner === 'p1' ? 'P1' : col.neutralOwner === 'p2' ? 'P2' : '·'}
              </div>
              {col.neutralOwner && (
                <div className="neutral-bonus">{NEUTRAL_BONUS[colNum]}</div>
              )}
            </div>

            <CardSlot
              state={state}
              cardId={col.p2Front}
              ownerPlayer="p2"
              zone="FRONT"
              column={colNum}
              isActive={isP2Active}
              highlight={
                col.p2Front && highlightSources.has(col.p2Front)
                  ? 'source'
                  : col.p2Front && highlightTargets.has(col.p2Front)
                    ? 'target'
                    : 'none'
              }
              onClick={() => onSlotClick(colNum, 'p2', 'FRONT', col.p2Front)}
              onAbilityClick={onAbilityClick}
              playerInfluence={playerInfluence}
              floating={floatingsByPos.get(`${colNum}:p2:FRONT`)}
			  replaceCost={col.p2Front ? replaceCosts?.get(col.p2Front) : undefined}
			  isMyCard={localPlayerId === "p2"}
            />

            <CardSlot
              state={state}
              cardId={col.p2Reserve}
              ownerPlayer="p2"
              zone="RESERVE"
              column={colNum}
              isActive={isP2Active}
              playable={p2ReservePlayable}
              highlight={
                col.p2Reserve && highlightTargets.has(col.p2Reserve) ? 'target' : 'none'
              }
              onClick={() => onSlotClick(colNum, 'p2', 'RESERVE', col.p2Reserve)}
              onAbilityClick={onAbilityClick}
              playerInfluence={playerInfluence}
              floating={floatingsByPos.get(`${colNum}:p2:RESERVE`)}
			  replaceCost={col.p2Reserve ? replaceCosts?.get(col.p2Reserve) : undefined}
			  isMyCard={localPlayerId === "p2"}
            />
          </div>
        );
      })}
    </div>
  );
}