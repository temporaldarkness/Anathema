import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { MeModule } from './me/me.module';
import { DecksModule } from './decks/decks.module';
import { MatchesModule } from './matches/matches.module';
import { UserGuard } from './common/user.guard';
import { RoomsModule } from './rooms/rooms.module';
import { SessionModule } from './session/session.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { RatingModule } from './rating/rating.module';
import { UsersModule } from './users/users.module';
import { FriendsModule } from './friends/friends.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    HealthModule,
    AuditModule,
    MeModule,
	DecksModule,
	MatchesModule,
	RoomsModule,
	SessionModule,
	MatchmakingModule,
	RatingModule,
	UsersModule,
	FriendsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: UserGuard },
  ],
})
export class AppModule {}