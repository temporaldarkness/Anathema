import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Public } from '../common/public.decorator';
import {
  ANON_ID_COOKIE,
  ANON_NAME_COOKIE,
  anonCookieOptions,
  generateAnonId,
  makeAnonCookieValue,
  readAnonFromCookie,
} from '../common/anon-cookie';
import { validateWebwaySession } from '../common/webway-session';
import { UsersService } from '../users/users.service';

const SetNameSchema = z.object({
  name: z.string().trim().min(1).max(32),
});

@Controller('session')
export class SessionController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get()
  async getSession(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await validateWebwaySession(req.headers.cookie);
    if (session) {
      this.users
        .upsertFromSession(session.userId, session.username)
        .catch(() => {});

      const profile = await this.users.getProfileSnapshot(session.userId);

      return {
        kind: 'authenticated',
        user: {
          id: session.userId,
          username: session.username,
          isAdmin: profile?.isAdmin ?? false,
          avatarUrl: profile?.avatarUrl ?? null,
        },
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

    reply.setCookie(ANON_ID_COOKIE, makeAnonCookieValue(newId), anonCookieOptions() as any);
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