import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { CalendarService } from './calendar.service.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarAiAdapter } from './calendar.ai.js';
import { GoogleController } from './google.controller.js';
import { GoogleSyncService } from './google-sync.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController, GoogleController],
  providers: [CalendarService, CalendarAiAdapter, GoogleSyncService],
  exports: [CalendarService],
})
export class CalendarModule {}
