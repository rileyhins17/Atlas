import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CreateJournalInput, type JournalDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { JournalService } from './journal.service.js';

@Controller('journal')
@UseGuards(SessionGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<JournalDTO[]> {
    return this.journal.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateJournalInput)) body: CreateJournalInput,
  ): Promise<JournalDTO> {
    return this.journal.create(user.id, body);
  }
}
