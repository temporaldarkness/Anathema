import type { GameState, CardInstanceId } from '@aspects/engine';
import { KEYWORD_TEXT, RARITY_TEXT, RARITY_COLOR, triggerText, effectText, conditionText } from '../game/abilityText';

interface Props {
  state: GameState;
  cardId: CardInstanceId;
}

export function CardTooltip({ state, cardId }: Props) {
  const card = state.cards[cardId];
  if (!card) return null;
  const def = state.definitions[card.definitionId];
  if (!def) return null;

  let strength = card.baseStrength;
  let hp = card.baseHealth - card.damageTaken;
  for (const m of card.modifiers) {
    if (m.stat === 'strength') strength += m.delta;
    if (m.stat === 'health') hp += m.delta;
  }
  strength = Math.max(0, strength);

  const hasModifiers = card.modifiers.length > 0;
  const hasKeywords = def.abilities.length > 0;
  const hasTriggers = def.triggers && def.triggers.length > 0;
  const hasActivated = def.activatedAbilities && def.activatedAbilities.length > 0;

  const rarityColor = RARITY_COLOR[def.rarity] ?? '#6b7280';

  return (
    <div
      className="tooltip"
      style={{ ['--rarity-color' as string]: rarityColor }}
    >
      <div className="tooltip-header">
        <span className="tooltip-name">{def.name}</span>
        <span className="tooltip-rarity">{RARITY_TEXT[def.rarity] ?? def.rarity}</span>
      </div>

      <div className="tooltip-stats">
        <span className="tooltip-stat-cost">💰 {def.cost}</span>
        <span className="tooltip-stat-str">⚔ {strength}{hasModifiers && '*'}</span>
        <span className="tooltip-stat-hp">❤ {hp}/{card.baseHealth}</span>
        {card.isToken && <span className="tooltip-badge">Токен</span>}
		{card.shieldAvailable && <span className="tooltip-badge tooltip-badge-shield">🛡 Щит активен</span>}
		{card.exhausted && <span className="tooltip-badge tooltip-badge-exh">💤 Истощён</span>}
      </div>
	  <div className="tooltip-personality">
        <span className="tooltip-personality-label">Личность:</span>
        <span className="tooltip-personality-value">{def.personalityTag}</span>
      </div>

      {hasKeywords && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Ключевые слова</div>
          {def.abilities.map((k) => (
            <div key={k} className="tooltip-keyword">{KEYWORD_TEXT[k] ?? k}</div>
          ))}
        </div>
      )}

      {hasTriggers && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Способности</div>
          {def.triggers.map((t: any, i: number) => (
            <div key={i} className="tooltip-trigger">
              <div className="tooltip-trigger-label">
                <span>{triggerText(t.trigger)}</span>
                {t.oncePerTurn && <span className="tooltip-tag">1/ход</span>}
			  </div>
			  {t.condition && (
			    <div className="tooltip-condition">
				  если {conditionText(t.condition)}
				</div>
			  )}
              <div className="tooltip-effects">
                {t.effects?.map((e: any, j: number) => (
                  <div key={j}>{effectText(e)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasActivated && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Активируемые</div>
          {def.activatedAbilities.map((a: any) => (
            <div key={a.id} className="tooltip-trigger">
              <div className="tooltip-trigger-label">
                ⚡ {a.id} <span className="tooltip-tag">{a.cost}💰</span>
              </div>
              <div className="tooltip-effects">
                {a.effects?.map((e: any, j: number) => (
                  <div key={j}>{effectText(e)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}