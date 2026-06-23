import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('workspaces/:slug')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: 'Get project dashboard statistics' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Project dashboard data.' })
  @Get('projects/:projectId/dashboard')
  async getProjectDashboard(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
  ) {
    return this.dashboardService.getProjectDashboard(projectId, req.user.userId);
  }

  @ApiOperation({ summary: 'Get workspace dashboard statistics' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'Workspace dashboard data.' })
  @Get('dashboard')
  async getWorkspaceDashboard(
    @Req() req: any,
    @Param('slug') slug: string,
  ) {
    return this.dashboardService.getWorkspaceDashboard(slug, req.user.userId);
  }
}
