import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@aspects/shared';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: CurrentUserType) {
    return {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
    };
  }
}