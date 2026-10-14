import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Public } from '../common/public.decorator';
import {
  ANON_ID_COOKIE,
  ANON_NAME_COOKIE,
  anonCookieOptions,
  generateAnonId,
  readAnonFromCookie,
} from '../common/anon-cookie';
import { UsersService } from '../users/users.service';

const SetNameSchema = z.object({
  name: z.string().trim().min(1).max(32),
});

/** Discord CDN URL — ASCII, проблем с кодировкой не будет. */
function readAvatarHeader(req: FastifyRequest): string | null {
  const raw = req.headers['x-user-avatar-url'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  // Отсекаем возможный data: / javascript: / и мусор, если прокси вдруг
  // отдаст странное. Оставляем только http(s).
  if (!/^https?:\/\//i.test(value)) return null;
  return value.slice(0, 512);
}

@Controller('session')
export class SessionController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get()
  getSession(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (userId) {
      const username = String(req.headers['x-user-name'] ?? '');
      const isAdmin = req.headers['x-user-is-admin'] === '1';
      const avatarUrl = readAvatarHeader(req);
    
      // Кэшируем профиль в нашей БД, чтобы потом отдавать его по id.
      this.users
        .upsertFromSession(String(userId), username, avatarUrl, isAdmin)
        .catch(() => {});
    
      return {
        kind: 'authenticated',
        user: { id: String(userId), username, isAdmin, avatarUrl },
      };
    }

    const { anonId, anonName } = readAnonFromCookie(req.headers.cookie);

    if (anonId) {
      return {
        kind: 'anonymous',
        anonId,
        anonName: anonName ?? 'Аноним',
      };
    }

    const newId = generateAnonId();
    const newName = 'Аноним';

    reply.setCookie(ANON_ID_COOKIE, newId, anonCookieOptions() as any);
    reply.setCookie(
      ANON_NAME_COOKIE,
      encodeURIComponent(newName),
      anonCookieOptions() as any,
    );

    return {
      kind: 'anonymous',
      anonId: newId,
      anonName: newName,
    };
  }

  @Public()
  @Post('name')
  setName(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const parsed = SetNameSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid_name' };
    }

    const { anonId } = readAnonFromCookie(req.headers.cookie);
    if (!anonId) {
      return { ok: false, reason: 'no_anon_id' };
    }

    reply.setCookie(
      ANON_NAME_COOKIE,
      encodeURIComponent(parsed.data.name),
      anonCookieOptions() as any,
    );

    return { ok: true, anonName: parsed.data.name };
  }
}