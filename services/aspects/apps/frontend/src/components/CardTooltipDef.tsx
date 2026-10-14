import type { CardDefinition } from '@aspects/cards';
import {
  KEYWORD_TEXT,
  RARITY_TEXT,
  RARITY_COLOR,
  triggerText,
  effectText,
  conditionText,
} from '../game/abilityText';

interface Props {
  def: CardDefinition;
}

export function CardTooltipDef({ def }: Props) {
  const rarityColor = RARITY_COLOR[def.rarity] ?? '#6b7280';
  const abilities = def.abilities ?? [];
  const hasKeywords = abilities.length > 0;
  const hasTriggers = (def.triggers ?? []).length > 0;
  const hasActivated = (def.activatedAbilities ?? []).length > 0;

  return (
    <div className="tooltip" style={{ ['--rarity-color' as string]: rarityColor }}>
      <div className="tooltip-header">
        <span className="tooltip-name">{def.name}</span>
        <span className="tooltip-rarity">
          {RARITY_TEXT[def.rarity] ?? def.rarity}
        </span>
      </div>

      <div className="tooltip-stats">
        <span className="tooltip-stat-cost">💰 {def.cost}</span>
        <span className="tooltip-stat-str">⚔ {def.strength}</span>
        <span className="tooltip-stat-hp">❤ {def.health}</span>
      </div>

      {hasKeywords && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Ключевые слова</div>
          {abilities.map((k) => (
            <div key={k} className="tooltip-keyword">
              {KEYWORD_TEXT[k] ?? k}
            </div>
          ))}
        </div>
      )}

      {hasTriggers && (
        <div className="tooltip-section">
          <div className="tooltip-section-title">Способности</div>
          {(def.triggers ?? []).map((t: any, i: number) => (
            <div key={i} className="tooltip-trigger">
              <div className="tooltip-trigger-label">
                {triggerText(t.trigger)}
                {t.oncePerTurn && <span className="tooltip-tag">1/ход</span>}
              </div>
              {t.condition && (
                <div className="tooltip-condition">
                  если {conditionText(t.condition)}
                </div>
              )}
              <div className="tooltip-effects">
                {(t.effects ?? []).map((e: any, j: number) => (
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
          {(def.activatedAbilities ?? []).map((a: any) => (
            <div key={a.id} className="tooltip-trigger">
              <div className="tooltip-trigger-label">
                ⚡ {a.id} <span className="tooltip-tag">{a.cost}💰</span>
              </div>
              <div className="tooltip-effects">
                {(a.effects ?? []).map((e: any, j: number) => (
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