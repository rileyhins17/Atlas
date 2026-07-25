import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateExerciseInput,
  FinishWorkoutInput,
  LogSetInput,
  PaginationQuery,
  StartWorkoutInput,
  type ExerciseDTO,
  type LastPerformanceDTO,
  type WorkoutDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { FitnessService } from './fitness.service.js';

@Controller('fitness')
@UseGuards(SessionGuard)
export class FitnessController {
  constructor(private readonly fitness: FitnessService) {}

  @Get('exercises')
  exercises(@CurrentUser() user: AuthedUser): Promise<ExerciseDTO[]> {
    return this.fitness.listExercises(user.id);
  }

  @Post('exercises')
  createExercise(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateExerciseInput)) body: CreateExerciseInput,
  ): Promise<ExerciseDTO> {
    return this.fitness.createExercise(user.id, body);
  }

  @Get('exercises/:id/last')
  lastPerformance(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
  ): Promise<LastPerformanceDTO | null> {
    return this.fitness.lastPerformance(user.id, id);
  }

  /** The open session, or null. Drives "resume workout". */
  @Get('workouts/active')
  active(@CurrentUser() user: AuthedUser): Promise<WorkoutDTO | null> {
    return this.fitness.active(user.id);
  }

  @Get('workouts')
  history(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(PaginationQuery)) query: PaginationQuery,
  ): Promise<WorkoutDTO[]> {
    return this.fitness.history(user.id, query);
  }

  @Post('workouts')
  start(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(StartWorkoutInput)) body: StartWorkoutInput,
  ): Promise<WorkoutDTO> {
    return this.fitness.start(user.id, body);
  }

  @Post('workouts/:id/sets')
  logSet(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LogSetInput)) body: LogSetInput,
  ): Promise<WorkoutDTO> {
    return this.fitness.logSet(user.id, id, body);
  }

  @Delete('workouts/:id/sets/:setId')
  deleteSet(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Param('setId') setId: string,
  ): Promise<WorkoutDTO> {
    return this.fitness.deleteSet(user.id, id, setId);
  }

  /** Returns null when an empty session was discarded rather than saved. */
  @Post('workouts/:id/finish')
  finish(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(FinishWorkoutInput)) body: FinishWorkoutInput,
  ): Promise<WorkoutDTO | null> {
    return this.fitness.finish(user.id, id, body);
  }
}
