import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateEventInput,
  EventListQuery,
  ShiftScheduleInput,
  UpdateEventInput,
  type EventDTO,
  type ShiftScheduleResult,
} from '@atlas/shared';
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
  list(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(EventListQuery)) query: EventListQuery,
  ): Promise<EventDTO[]> {
    return this.calendar.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateEventInput)) body: CreateEventInput,
  ): Promise<EventDTO> {
    return this.calendar.create(user.id, body);
  }

  /**
   * Declared ahead of the `:id` routes on purpose: Nest matches in declaration
   * order, so `POST /events/shift` would otherwise be read as an id.
   */
  @Post('shift')
  shift(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(ShiftScheduleInput)) body: ShiftScheduleInput,
  ): Promise<ShiftScheduleResult> {
    return this.calendar.shiftSchedule(user.id, user.timezone, body);
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
