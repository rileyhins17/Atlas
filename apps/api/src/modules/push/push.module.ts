import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { PushService } from './push.service.js';
import { PushController } from './push.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
