import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CurrentUser } from '../common/current-user.decorator';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  type CurrentUser as CurrentUserType,
} from '@aspects/shared';
import { z } from 'zod';

const InviteSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(50),
});

const TakeoverSchema = z.object({
  seat: z.enum(['p1', 'p2']),
});


@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  async create(@CurrentUser() user: CurrentUserType, @Body() body: unknown) {
    const dto = CreateRoomSchema.parse(body);
    const room = await this.rooms.create(user.id, user.username, dto);
    return this.rooms.toPublic(room);
  }
  @Post(':code/invite')
  async invite(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const dto = InviteSchema.parse(body);
    return this.rooms.inviteToRoom(code.toUpperCase(), user.id, dto.userIds);
  }

  @Post(':code/join')
  async join(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const dto = JoinRoomSchema.parse(body);
    const room = await this.rooms.join(user.id, user.username, code.toUpperCase(), dto);
    return this.rooms.toPublic(room);
  }

  @Get(':code')
  async get(@Param('code') code: string) {
    const room = await this.rooms.get(code.toUpperCase());
    if (!room) return null;
    return this.rooms.toPublic(room);
  }
  
  @Post(':code/rematch')
  async rematch(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
  ) {
    const room = await this.rooms.rematch(code.toUpperCase(), user.id);
    return this.rooms.toPublic(room);
  }

  @Get()
  async listMine(@CurrentUser() user: CurrentUserType) {
    return this.rooms.listMine(user.id);
  }

  @Delete(':code')
  async leave(@CurrentUser() user: CurrentUserType, @Param('code') code: string) {
    await this.rooms.leave(user.id, code.toUpperCase());
    return { ok: true };
  }
  
  @Post(':code/allow-takeover')
  async allowTakeover(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const dto = TakeoverSchema.parse(body);
    await this.rooms.allowTakeover(code.toUpperCase(), user.id, dto.seat);
    return { ok: true };
  }
  
  @Post(':code/takeover')
  async takeover(
    @CurrentUser() user: CurrentUserType,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const dto = TakeoverSchema.parse(body);
    await this.rooms.claimSeat(
      code.toUpperCase(),
      user.id,
      user.username,
      dto.seat,
    );
    return { ok: true };
  }
}