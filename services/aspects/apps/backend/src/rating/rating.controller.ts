import { Controller, Get, Param, Query } from '@nestjs/common';
import { RatingService } from './rating.service';
import { CurrentUser } from '../common/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@aspects/shared';

@Controller('rating')
export class RatingController {
  constructor(private readonly rating: RatingService) {}

  @Get('me')
  async me(@CurrentUser() user: CurrentUserType) {
    return this.rating.getPublic(user.id);
  }

  @Get('history/me')
  async historyMe(
    @CurrentUser() user: CurrentUserType,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 20;
    return this.rating.getHistory(user.id, Number.isFinite(n) ? n : 20);
  }

  /** Рейтинговая таблица ботов — для BotsModal. */
  @Get('bots/all')
  async botsAll() {
    return this.rating.getBotRatings();
  }

  @Get(':userId/history')
  async history(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 20;
    return this.rating.getHistory(userId, Number.isFinite(n) ? n : 20);
  }

  @Get(':userId')
  async byUser(@Param('userId') userId: string) {
    return this.rating.getPublic(userId);
  }
}