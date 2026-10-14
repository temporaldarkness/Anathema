import { Module } from '@nestjs/common';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';
import { BotRatingService } from './bot-rating.service';

@Module({
  controllers: [RatingController],
  providers: [RatingService, BotRatingService],
  exports: [RatingService, BotRatingService],
})
export class RatingModule {}