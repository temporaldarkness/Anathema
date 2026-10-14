import type { PublicRating } from '../game/ratingApi';

interface Props {
  rating: PublicRating | null;
  loading?: boolean;
  size?: 'sm' | 'md';
}

const TIER_EMOJI: Record<string, string> = {
  'Новичок': '🥉',
  'Ученик': '🥈',
  'Любитель': '🥇',
  'Опытный': '⭐',
  'Ветеран': '🌟',
  'Мастер': '👑',
  'Гроссмейстер': '💎',
};

export function RatingBadge({ rating, loading, size = 'md' }: Props) {
  if (loading || !rating) {
    return (
      <span className={`rating-badge rating-badge-${size} rating-badge-loading`}>
        ···
      </span>
    );
  }

  const emoji = TIER_EMOJI[rating.tier] ?? '🏆';
  const gamesTotal = rating.matchesPlayed;

  return (
    <span
      className={`rating-badge rating-badge-${size}`}
      title={
        gamesTotal > 0
          ? `${rating.tier} · RD ${rating.rd} · ${rating.wins}В / ${rating.losses}П`
          : 'Сыграйте первую партию, чтобы установить рейтинг'
      }
    >
      <span className="rating-badge-icon">{emoji}</span>
      <span className="rating-badge-value">{rating.rating}</span>
      <span className="rating-badge-tier">{rating.tier}</span>
    </span>
  );
}