import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { SearchService } from './search.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('workspaces/:slug/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  async search(
    @CurrentUser() user: any,
    @Param('slug') slug: string,
    @Query('q') query: string,
    @Query('scope') scope: 'workspace' | 'project' = 'workspace',
    @Query('projectId') projectId?: string,
  ) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    return this.searchService.search(user.userId, slug, query, scope, projectId);
  }
}
