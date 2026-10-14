import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { readAnonFromCookie } from './anon-cookie';

@Injectable()
export class UserGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    const userId = req.headers['x-user-id'];
    if (userId) {
      req.user = {
        id: String(userId),
        username: String(req.headers['x-user-name'] ?? ''),
        isAdmin: req.headers['x-user-is-admin'] === '1',
      };
      return true;
    }

    const { anonId, anonName } = readAnonFromCookie(req.headers.cookie);
    if (anonId) {
      req.user = {
        id: `anon:${anonId}`,
        username: anonName ?? 'Аноним',
        isAdmin: false,
      };
      return true;
    }

    throw new UnauthorizedException('Not authenticated');
  }
}