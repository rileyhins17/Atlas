import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { JournalService } from './journal.service.js';
import { JournalController } from './journal.controller.js';
import { JournalAiAdapter } from './journal.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [JournalController],
  providers: [JournalService, JournalAiAdapter],
  exports: [JournalService],
})
export class JournalModule {}
