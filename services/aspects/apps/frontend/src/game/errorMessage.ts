/**
 * NestJS отдаёт ошибки в формате { message: string | string[], error, statusCode }.
 * Fetch-обёртка может отдать это как сырой JSON-текст или как Error с ним в message.
 * Достаём человекочитаемое сообщение.
 */
export function extractErrorMessage(e: unknown): string {
  if (!e) return 'Неизвестная ошибка';

  const tryParse = (s: string): string | null => {
    const t = s.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) return null;
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') {
        const m = (parsed as { message?: unknown }).message;
        if (Array.isArray(m)) return m.map((x) => String(x)).join('; ');
        if (typeof m === 'string') return m;
        const err = (parsed as { error?: unknown }).error;
        if (typeof err === 'string') return err;
      }
    } catch {
      /* not JSON */
    }
    return null;
  };

  if (e instanceof Error) {
    return tryParse(e.message) ?? e.message ?? 'Ошибка';
  }

  const asString = String(e);
  return tryParse(asString) ?? asString;
}

const RUSSIAN_MESSAGES: Record<string, string> = {
  'Deck P2 must have exactly 30 cards': 'Колода должна содержать ровно 30 карт',
  'Deck P1 must have exactly 30 cards': 'Колода должна содержать ровно 30 карт',
  'Room is full': 'Комната уже занята',
  'Room not found': 'Комната не найдена',
  'Cannot join your own room': 'Нельзя присоединиться к своей же комнате',
  'Opponent has not joined yet': 'Соперник ещё не присоединился',
};

export function localizeErrorMessage(raw: string): string {
  return RUSSIAN_MESSAGES[raw] ?? raw;
}