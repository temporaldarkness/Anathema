import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 20;
    return this.users.search(q ?? '', Number.isFinite(n) ? n : 20);
  }
  
  @Get('leaderboard')
  async leaderboard(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 100;
    return this.users.getLeaderboard(Number.isFinite(n) ? n : 100);
  }
  
  @Get(':userId')
  async get(@Param('userId') userId: string) {
    if (userId.startsWith('anon:')) {
      throw new NotFoundException('Anonymous users have no public profile');
    }
    const result = await this.users.getPublic(userId);
    if (!result) throw new NotFoundException('User not found');
    return result;
  }
}