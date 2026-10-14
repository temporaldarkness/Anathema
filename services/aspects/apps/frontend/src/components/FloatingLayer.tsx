import type { Floating } from '../game/floatings';

export function FloatingLayer({ items }: { items: Floating[] | undefined }) {
  if (!items || items.length === 0) return null;
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