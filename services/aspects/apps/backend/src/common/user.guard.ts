import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { readAnonFromCookie } from './anon-cookie';
import { validateWebwaySession } from './webway-session';
import { PrismaService } from '../prisma/prisma.service';
import { timingSafeEqualStr } from './anon-cookie';

@Injectable()
export class UserGuard implements CanActivate {
  private readonly logger = new Logger(UserGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    const session = await validateWebwaySession(req.headers.cookie);
    if (session) {
      req.user = {
        id: session.userId,
        username: session.username,
        isAdmin: await this.lookupIsAdmin(session.userId),
      };
      return true;
    }

    const anon = readAnonFromCookie(req.headers.cookie);
    if (anon.anonId) {
      req.user = {
        id: `anon:${anon.anonId}`,
        username: anon.anonName ?? 'Аноним',
        isAdmin: false,
      };
      return true;
    }
    const internalToken = req.headers['x-internal-token'];
    const secret = process.env.INTERNAL_API_TOKEN;
    if (typeof internalToken === 'string' && secret) {
      if (timingSafeEqualStr(internalToken, secret)) {
        const rawId = String(req.headers['x-on-behalf-of-user-id'] ?? '');
        const rawName = String(req.headers['x-on-behalf-of-username'] ?? '');
        if (/^[A-Za-z0-9:_-]{1,64}$/.test(rawId)) {
          req.user = {
            id: rawId,
            username: rawName.slice(0, 64) || 'Внутренний сервис',
            isAdmin: await this.lookupIsAdmin(rawId),
          };
          return true;
        }
      }
      this.logger.warn('Rejected request with invalid x-internal-token');
    }

    throw new UnauthorizedException('Not authenticated');
  }

  private async lookupIsAdmin(userId: string): Promise<boolean> {
    try {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { isAdmin: true },
      });
      return profile?.isAdmin ?? false;
    } catch (e) {
      this.logger.warn(`isAdmin lookup failed for ${userId}: ${String(e)}`);
      return false;
    }
  }
}
