import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { applyCommand, type Command, type GameState } from '@aspects/engine';
import type { RoomState } from '@aspects/shared';
import { RoomsService } from './rooms.service';
import { REDIS_CLIENT } from './redis.provider';

interface SocketData {
  userId: string | null;
  username: string | null;
  roomCode: string | null;
}

function getHeader(socket: Socket, name: string): string | null {
  const val = socket.handshake.headers[name.toLowerCase()];
  if (Array.isArray(val)) return val[0] ?? null;
  return typeof val === 'string' ? val : null;
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: '/socket.io',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  private readonly socketData = new WeakMap<Socket, SocketData>();

  constructor(
    private readonly rooms: RoomsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  handleConnection(socket: Socket): void {
    const userId = getHeader(socket, 'x-user-id');
    const username = getHeader(socket, 'x-user-name');

    this.socketData.set(socket, {
      userId,
      username,
      roomCode: null,
    });

    this.logger.log(
      `Connected: ${socket.id} (user=${userId ?? 'anonymous'})`,
    );
  }

  handleDisconnect(socket: Socket): void {
    const data = this.socketData.get(socket);
    if (!data) return;

    if (data.roomCode && data.userId) {
      socket.to(`room:${data.roomCode}`).emit('guest_left', {
        guestName: data.username ?? 'Игрок',
      });

      this.rooms.get(data.roomCode).then((room) => {
        if (room && room.guestId === data.userId) {
        }
      });
    }

    this.logger.log(`Disconnected: ${socket.id}`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { roomCode: string },
  ): Promise<void> {
    const data = this.socketData.get(socket);
    if (!data || !data.userId) {
      socket.emit('command_error', {
        reason: 'not_authenticated',
        expectedVersion: 0,
      });
      return;
    }

    const code = payload.roomCode.toUpperCase();
    const room = await this.rooms.get(code);
    if (!room) {
      socket.emit('command_error', {
        reason: 'room_not_found',
        expectedVersion: 0,
      });
      return;
    }

    const isOwner = room.ownerId === data.userId;
    const isGuest = room.guestId === data.userId;
    if (!isOwner && !isGuest) {
      socket.emit('command_error', {
        reason: 'not_in_room',
        expectedVersion: 0,
      });
      return;
    }

    if (data.roomCode) {
      socket.leave(`room:${data.roomCode}`);
    }

    data.roomCode = code;
    this.socketData.set(socket, data);
    socket.join(`room:${code}`);

    this.server.to(`room:${code}`).emit('state_sync', {
      state: room.gameState,
      version: room.version,
      roomInfo: this.rooms.toPublic(room),
      events: [],
    });

    if (isGuest) {
      socket.to(`room:${code}`).emit('guest_joined', {
        guestName: data.username ?? 'Игрок',
        roomInfo: this.rooms.toPublic(room),
      });
    }
  }

  @SubscribeMessage('command')
  async handleCommand(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { command: Command; expectedVersion: number },
  ): Promise<void> {
    const data = this.socketData.get(socket);
    if (!data || !data.userId || !data.roomCode) {
      socket.emit('command_error', {
        reason: 'not_subscribed',
        expectedVersion: payload.expectedVersion,
      });
      return;
    }

    const lockKey = `aspects:room_lock:${data.roomCode}`;
    const lockToken = `${Date.now()}-${Math.random()}`;
    const gotLock = await this.redis.set(
      lockKey,
      lockToken,
      'PX',
      3000,
      'NX',
    );
    if (gotLock !== 'OK') {
      socket.emit('command_error', {
        reason: 'room_busy',
        expectedVersion: payload.expectedVersion,
      });
      return;
    }

    try {
      const room = await this.rooms.get(data.roomCode);
      if (!room) {
        socket.emit('command_error', {
          reason: 'room_not_found',
          expectedVersion: payload.expectedVersion,
        });
        return;
      }

      if (payload.expectedVersion !== room.version) {
        socket.emit('state_sync', {
          state: room.gameState,
          version: room.version,
          roomInfo: this.rooms.toPublic(room),
          events: [],
        });
        return;
      }

      const isOwner = room.ownerId === data.userId;
      const isGuest = room.guestId === data.userId;
      if (!isOwner && !isGuest) {
        socket.emit('command_error', {
          reason: 'not_in_room',
          expectedVersion: payload.expectedVersion,
        });
        return;
      }

      const playerId = isOwner ? 'p1' : 'p2';
      const command = payload.command;

      const commandPlayerId =
        'playerId' in (command as any)
          ? (command as any).playerId
          : null;
      if (commandPlayerId && commandPlayerId !== playerId) {
        socket.emit('command_error', {
          reason: 'not_your_command',
          expectedVersion: payload.expectedVersion,
        });
        return;
      }

      const state = room.gameState as GameState;
      const result = applyCommand(state, command);

      const rejected = result.events.some(
        (e) => e.type === 'COMMAND_REJECTED',
      );
      if (rejected) {
        socket.emit('command_error', {
          reason: 'command_rejected',
          expectedVersion: payload.expectedVersion,
        });
        return;
      }

      room.gameState = result.state;
      room.version += 1;
      await this.rooms.save(room);

      this.server.to(`room:${room.code}`).emit('state_update', {
        state: result.state,
        version: room.version,
        events: result.events,
      });

      if (result.state.winner) {
        this.server.to(`room:${room.code}`).emit('game_over', {
          winner: result.state.winner,
          reason: result.state.winnerReason ?? '',
        });
      }
    } finally {
      const current = await this.redis.get(lockKey);
      if (current === lockToken) {
        await this.redis.del(lockKey);
      }
    }
  }
}