import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { DecksService } from './decks.service';
import { CurrentUser } from '../common/current-user.decorator';
import {
  CreateDeckSchema,
  UpdateDeckSchema,
  type CurrentUser as CurrentUserType,
} from '@aspects/shared';

@Controller('decks')
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserType) {
    return this.decks.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    const dto = CreateDeckSchema.parse(body);
    return this.decks.create(user.id, user.username, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const dto = UpdateDeckSchema.parse(body);
    return this.decks.update(user.id, user.username, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ): Promise<void> {
    await this.decks.remove(user.id, user.username, id);
  }
}