import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { NotesService } from './notes.service.js';
import { NotesController } from './notes.controller.js';
import { NotesAiAdapter } from './notes.ai.js';

@Module({
  imports: [AuthModule],
  controllers: [NotesController],
  providers: [NotesService, NotesAiAdapter],
  exports: [NotesService],
})
export class NotesModule {}
