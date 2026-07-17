import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateNoteInput, UpdateNoteInput, type NoteDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { NotesService } from './notes.service.js';

@Controller('notes')
@UseGuards(SessionGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<NoteDTO[]> {
    return this.notes.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateNoteInput)) body: CreateNoteInput,
  ): Promise<NoteDTO> {
    return this.notes.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateNoteInput)) body: UpdateNoteInput,
  ): Promise<NoteDTO> {
    return this.notes.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.notes.remove(user.id, id);
  }
}
