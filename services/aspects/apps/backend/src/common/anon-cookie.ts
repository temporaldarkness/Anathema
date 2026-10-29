import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const ANON_ID_COOKIE = 'aspects_anon_id';
export const ANON_NAME_COOKIE = 'aspects_anon_name';
export const ANON_COOKIE_PATH = '/games/aspects';
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 дней

function anonSecret(): string | null {
  return process.env.ANON_COOKIE_SECRET ?? null;
}

function sign(value: string): string {
  const secret = anonSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function makeAnonCookieValue(anonId: string): string {
  const sig = sign(anonId);
  return sig ? `${anonId}.${sig}` : anonId;
}

export function verifyAnonCookieValue(raw: string | null): string | null {
  if (!raw) return null;
  const secret = anonSecret();
  if (!secret) {
    return /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null;
  }
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(id);
  if (!expected || sig.length !== expected.length) return null;
  const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? id : null;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function generateAnonId(): string {
  return randomUUID();
}

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
  const anonId = verifyAnonCookieValue(cookies[ANON_ID_COOKIE] || null);
  let anonName: string | null = null;
  const rawName = cookies[ANON_NAME_COOKIE];
  if (rawName) {
    anonName = safeDecodeURIComponent(rawName).slice(0, 32);
  }
  return { anonId, anonName };
}

export function anonCookieOptions() {
  return {
    path: ANON_COOKIE_PATH,
    maxAge: ANON_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}