import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import type { AuditPayload } from '@aspects/shared';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly config: ConfigService) {}

  async log(payload: AuditPayload): Promise<void> {
    try {
      const res = await fetch(`${this.config.webwayBackendUrl}/api/games/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.webwayApiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.warn(`audit failed: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      this.logger.warn(`audit transport error: ${(e as Error).message}`);
    }
  }
}