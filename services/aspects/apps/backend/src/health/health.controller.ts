import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/public.decorator';

const BOOT_TIME = Date.now();

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      uptime_seconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
    };
  }
}