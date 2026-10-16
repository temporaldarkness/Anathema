import type { GameState, CardInstanceId } from '@aspects/engine';
import { getPersonalityName, getFactionInfo, getRoleInfo } from '@aspects/cards';
import {
  resolveKeywordText,
  RARITY_TEXT,
  RARITY_COLOR,
  triggerText,
  effectText,
  conditionText,
} from '../game/abilityText';

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
        {card.shieldAvailable && (
          <span className="tooltip-badge tooltip-badge-shield">🛡 Щит активен</span>
        )}
        {card.exhausted && (
          <span className="tooltip-badge tooltip-badge-exh">💤 Истощён</span>
        )}
      </div>

      {def.name !== getPersonalityName(def.personalityTag) && (
        <div className="tooltip-personality">
          <span className="tooltip-personality-label">Личность:</span>
          <span className="tooltip-personality-value">
            {getPersonalityName(def.personalityTag)}
          </span>
        </div>
      )}
	  {(def.factions?.length || def.roles?.length) && (
        <div className="tooltip-tags">
          {def.factions?.map((f) => {
            const info = getFactionInfo(f);
            return (
              <span
                key={`f-${f}`}
                className="tooltip-tag-faction"
                style={{ ['--tag-color' as string]: info.color }}
              >
                {info.name}
              </span>
            );
          })}
          {def.roles?.map((r) => {
            const info = getRoleInfo(r);
            return (
              <span key={`r-${r}`} className="tooltip-tag-role">
                {info.icon} {info.name}
              </span>
            );
          })}
        </div>
      )}

      {hasKeywords && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Ключевые слова</div>
          {def.abilities.map((k) => (
            <div key={k} className="tooltip-keyword">
              {resolveKeywordText(def, k)}
            </div>
          ))}
        </div>
      )}

      {hasTriggers && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Способности</div>
          {def.triggers.map((t: any, i: number) => {
            const name = t.name ?? triggerText(t.trigger);
            return (
              <div key={i} className="tooltip-trigger">
                <div className="tooltip-trigger-label">
                  <span>{name}</span>
                  {t.oncePerTurn && <span className="tooltip-tag">1/ход</span>}
                </div>
                {t.condition && (
                  <div className="tooltip-condition">
                    если {conditionText(t.condition)}
                  </div>
                )}
                {t.description ? (
                  <div className="tooltip-effects">{t.description}</div>
                ) : (
                  <div className="tooltip-effects">
                    {t.effects?.map((e: any, j: number) => (
                      <div key={j}>{effectText(e)}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasActivated && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Активируемые</div>
          {def.activatedAbilities.map((a: any) => {
            const name = a.name ?? a.id;
            return (
              <div key={a.id} className="tooltip-trigger">
                <div className="tooltip-trigger-label">
                  ⚡ {name} <span className="tooltip-tag">{a.cost}💰</span>
                </div>
                {a.description ? (
                  <div className="tooltip-effects">{a.description}</div>
                ) : (
                  <div className="tooltip-effects">
                    {a.effects?.map((e: any, j: number) => (
                      <div key={j}>{effectText(e)}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}