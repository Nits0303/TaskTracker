import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { SearchService } from './search.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('workspaces/:slug/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @ApiOperation({ summary: 'Search across workspace or project' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiQuery({ name: 'q', description: 'Search query string', example: 'bug fix' })
  @ApiQuery({ name: 'scope', required: false, description: 'Search scope', enum: ['workspace', 'project'] })
  @ApiQuery({ name: 'projectId', required: false, description: 'Filter by project ID if scope is project' })
  @ApiResponse({ status: 200, description: 'Search results.' })
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
