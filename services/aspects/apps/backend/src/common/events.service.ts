import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class EventsService {
  private io: Server | null = null;

  /** Вызывается один раз из attachSocketIo после создания io. */
  attach(io: Server): void {
    this.io = io;
  }

  /** Эмитит событие в user:<userId>. Если io ещё нет — no-op. */
  toUser(userId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, payload);
  }
}