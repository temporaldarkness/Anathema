import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { CurrentUser } from '../common/current-user.decorator';
import {
  MatchmakingQueueSchema,
  type CurrentUser as CurrentUserType,
} from '@aspects/shared';

@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  @Post('queue')
  async enqueue(
    @CurrentUser() user: CurrentUserType,
    @Body() body: unknown,
  ) {
    const dto = MatchmakingQueueSchema.parse(body);
    return this.matchmaking.enqueue(
      user.id,
      user.username,
      dto.packId,
      dto.deckId,
      dto.deckCards,
    );
  }

  @Delete('queue')
  async dequeue(@CurrentUser() user: CurrentUserType) {
    await this.matchmaking.dequeue(user.id);
    return { ok: true };
  }

  @Get('status')
  async status(@CurrentUser() user: CurrentUserType) {
    return this.matchmaking.status(user.id);
  }
}