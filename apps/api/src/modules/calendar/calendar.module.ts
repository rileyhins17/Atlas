import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { CalendarService } from './calendar.service.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarAiAdapter } from './calendar.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarAiAdapter],
  exports: [CalendarService],
})
export class CalendarModule {}
