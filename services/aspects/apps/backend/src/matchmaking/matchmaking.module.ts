import { Module } from '@nestjs/common';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { RoomsModule } from '../rooms/rooms.module';
import { RatingModule } from '../rating/rating.module';

@Module({
  imports: [RoomsModule, RatingModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}