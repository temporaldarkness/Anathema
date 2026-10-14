import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CurrentUser } from '../common/current-user.decorator';
import {
  SaveMatchSchema,
  type CurrentUser as CurrentUserType,
} from '@aspects/shared';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Post()
  save(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    const dto = SaveMatchSchema.parse(body);
    return this.matches.save(user.id, user.username, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserType) {
    return this.matches.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.matches.get(user.id, id);
  }
}