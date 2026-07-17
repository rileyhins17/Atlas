import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateEventInput, UpdateEventInput, type EventDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { CalendarService } from './calendar.service.js';

@Controller('events')
@UseGuards(SessionGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser): Promise<EventDTO[]> {
    return this.calendar.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateEventInput)) body: CreateEventInput,
  ): Promise<EventDTO> {
    return this.calendar.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEventInput)) body: UpdateEventInput,
  ): Promise<EventDTO> {
    return this.calendar.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.calendar.remove(user.id, id);
  }
}
