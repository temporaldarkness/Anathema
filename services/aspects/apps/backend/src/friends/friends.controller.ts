import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { FriendsService } from './friends.service';
import { CurrentUser } from '../common/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@aspects/shared';

const RequestSchema = z.object({
  userId: z.string().min(1),
});

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  async list(@CurrentUser() user: CurrentUserType) {
    return this.friends.list(user.id);
  }

  @Get('requests/incoming')
  async incoming(@CurrentUser() user: CurrentUserType) {
    return this.friends.incomingRequests(user.id);
  }

  @Get('requests/outgoing')
  async outgoing(@CurrentUser() user: CurrentUserType) {
    return this.friends.outgoingRequests(user.id);
  }

  @Get('status/:targetId')
  async status(
    @CurrentUser() user: CurrentUserType,
    @Param('targetId') targetId: string,
  ) {
    return this.friends.relationStatus(user.id, targetId);
  }

  @Post('request')
  async request(
    @CurrentUser() user: CurrentUserType,
    @Body() body: unknown,
  ) {
    const dto = RequestSchema.parse(body);
    await this.friends.sendRequest(user.id, dto.userId);
    return { ok: true };
  }

  @Post('requests/:id/accept')
  async accept(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ) {
    await this.friends.acceptRequest(user.id, id);
    return { ok: true };
  }

  @Post('requests/:id/decline')
  async decline(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ) {
    await this.friends.declineRequest(user.id, id);
    return { ok: true };
  }

  @Delete('requests/:id')
  async cancel(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ) {
    await this.friends.cancelOutgoing(user.id, id);
    return { ok: true };
  }

  @Delete(':friendId')
  async remove(
    @CurrentUser() user: CurrentUserType,
    @Param('friendId') friendId: string,
  ) {
    await this.friends.removeFriend(user.id, friendId);
    return { ok: true };
  }
}