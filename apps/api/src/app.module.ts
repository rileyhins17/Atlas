import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core/core.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { HabitsModule } from './modules/habits/habits.module.js';
import { JournalModule } from './modules/journal/journal.module.js';
import { NotesModule } from './modules/notes/notes.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { OriginCheckMiddleware } from './common/origin-check.middleware.js';

@Module({
  imports: [
    // Global rate limit: 120 requests / minute / IP. Auth routes tighten this
    // further with @Throttle (see AuthController).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    // In-process scheduling (embedding backfill today; nudges/weekly review
    // later). Move to BullMQ + Redis only if this stops being enough.
    ScheduleModule.forRoot(),
    CoreModule,
    AuthModule,
    TasksModule,
    HabitsModule,
    JournalModule,
    NotesModule,
    CalendarModule,
    AiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, OriginCheckMiddleware).forRoutes('*');
  }
}
