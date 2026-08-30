import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateJournalInput,
  PaginationQuery,
  UpdateJournalInput,
  type JournalDTO,
} from '@atlas/shared';
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
  list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(PaginationQuery)) page: PaginationQuery,
  ): Promise<JournalDTO[]> {
    return this.journal.list(user.id, page);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateJournalInput)) body: CreateJournalInput,
  ): Promise<JournalDTO> {
    return this.journal.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateJournalInput)) body: UpdateJournalInput,
  ): Promise<JournalDTO> {
    return this.journal.update(user.id, id, body);
  }
}
