import Redis from 'ioredis';

export interface WebwaySessionUser {
  userId: string;
  username: string;
}

let webwayRedis: Redis | null = null;

function getWebwayRedis(): Redis | null {
  const url = process.env.WEBWAY_REDIS_URL ?? process.env.REDIS_URL;
  if (!url) return null;
  if (!webwayRedis) {
    webwayRedis = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    webwayRedis.on('error', () => {
      /* ошибки соединения обрабатываются на уровне запроса */
    });
  }
  return webwayRedis;
}

function parseCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

export async function validateWebwaySession(
  cookieHeader: string | undefined,
): Promise<WebwaySessionUser | null> {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'session_id';
  const sessionId = parseCookieValue(cookieHeader, cookieName);
  if (!sessionId) return null;

  const redis = getWebwayRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(`session:${sessionId}`);
    if (!raw) return null;

    const idMatch = raw.match(/"user_id"\s*:\s*"?(\d+)"?/);
    if (!idMatch) return null;
    const userId = idMatch[1];

    const nameMatch = raw.match(/"username"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    let username = 'Гость';
    if (nameMatch) {
      try {
        username = JSON.parse(`"${nameMatch[1]}"`);
      } catch {
        username = nameMatch[1];
      }
    }
    return { userId, username };
  } catch {
    return null;
  }
}
