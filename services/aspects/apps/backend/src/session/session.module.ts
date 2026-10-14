import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [SessionController],
})
export class SessionModule {}