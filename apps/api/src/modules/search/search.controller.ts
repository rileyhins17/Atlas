import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchQuery, type SearchResultDTO } from '@atlas/shared';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { SessionGuard } from '../../auth/session.guard.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthedUser } from '../../auth/auth.service.js';
import { SearchService } from './search.service.js';

@Controller('search')
@UseGuards(SessionGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(SearchQuery)) query: SearchQuery,
  ): Promise<SearchResultDTO> {
    return this.search.search(user.id, query.q);
  }
}
