import { randomUUID } from 'node:crypto';

export const ANON_ID_COOKIE = 'aspects_anon_id';
export const ANON_NAME_COOKIE = 'aspects_anon_name';
export const ANON_COOKIE_PATH = '/games/aspects';
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

export function generateAnonId(): string {
  return randomUUID();
}

/**
 * Некоторые пути записи cookie могут URL-энкодить имя дважды
 * (фронт уже отдаёт encoded, сервис снова encodeURIComponent'ит).
 * Поэтому снимаем слои, пока строка меняется. Максимум 3 итерации —
 * защита от бесконечного цикла.
 */
function safeDecodeURIComponent(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(current)) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    result[name] = value;
  }
  return result;
}

export function readAnonFromCookie(cookieHeader: string | undefined): {
  anonId: string | null;
  anonName: string | null;
} {
  const cookies = parseCookies(cookieHeader);
  const anonId = cookies[ANON_ID_COOKIE] || null;
  let anonName: string | null = null;
  const rawName = cookies[ANON_NAME_COOKIE];
  if (rawName) {
    anonName = safeDecodeURIComponent(rawName);
  }
  return { anonId, anonName };
}

export function anonCookieOptions() {
  return {
    path: ANON_COOKIE_PATH,
    maxAge: ANON_COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: false,
  };
}