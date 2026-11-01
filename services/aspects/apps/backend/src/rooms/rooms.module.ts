import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { redisProvider } from './redis.provider';
import { EventsModule } from '../common/events.module';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [EventsModule, EconomyModule],
  controllers: [RoomsController],
  providers: [RoomsService, redisProvider],
  exports: [RoomsService, redisProvider],
})
export class RoomsModule {}