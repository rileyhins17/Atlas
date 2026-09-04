import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApplySplitInput,
  CreateExerciseInput,
  CreateWorkoutTemplateInput,
  FinishWorkoutInput,
  LogSetInput,
  PaginationQuery,
  PlanSplitInput,
  StartWorkoutInput,
  UpdateWorkoutTemplateInput,
  type ExerciseDTO,
  type ExerciseHistoryDTO,
  type LastPerformanceDTO,
  type PlanSplitResultDTO,
  type WorkoutDTO,
  type WorkoutTemplateDTO,
} from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { FitnessService } from './fitness.service.js';
import { WorkoutTemplatesService } from './workout-templates.service.js';

@Controller('fitness')
@UseGuards(SessionGuard)
export class FitnessController {
  constructor(
    private readonly fitness: FitnessService,
    private readonly templates: WorkoutTemplatesService,
  ) {}

  // ── Workout days (templates) ────────────────────────────────────────────
  // Declared before `workouts/:id`-style routes so a literal path segment is
  // never shadowed by a parameterised one.

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthedUser): Promise<WorkoutTemplateDTO[]> {
    return this.templates.list(user.id);
  }

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(CreateWorkoutTemplateInput)) body: CreateWorkoutTemplateInput,
  ): Promise<WorkoutTemplateDTO> {
    return this.templates.create(user.id, body);
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWorkoutTemplateInput)) body: UpdateWorkoutTemplateInput,
  ): Promise<WorkoutTemplateDTO> {
    return this.templates.update(user.id, id, body);
  }

  @Delete('templates/:id')
  removeTemplate(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.templates.remove(user.id, id);
  }

  /** Read a written split into proposed days. Writes nothing. */
  @Post('templates/plan')
  planSplit(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(PlanSplitInput)) body: PlanSplitInput,
  ): Promise<PlanSplitResultDTO> {
    return this.templates.planSplit(user.id, body.text);
  }

  /** Accept a proposal — the only endpoint here that creates anything. */
  @Post('templates/apply')
  applySplit(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(ApplySplitInput)) body: ApplySplitInput,
  ): Promise<WorkoutTemplateDTO[]> {
    return this.templates.applyProposal(user.id, body.templates);
  }

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

  /**
   * Everything logged for one movement — the screen a paid tracker is lived in.
   * Bounded in the service rather than paginated: it is a chart and a log, both
   * of which stop being readable long before they stop being bounded.
   */
  @Get('exercises/:id/history')
  exerciseHistory(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
  ): Promise<ExerciseHistoryDTO> {
    return this.fitness.exerciseHistory(user.id, id);
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
