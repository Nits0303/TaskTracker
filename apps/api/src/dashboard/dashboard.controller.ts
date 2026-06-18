import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:slug')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('projects/:projectId/dashboard')
  async getProjectDashboard(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
  ) {
    return this.dashboardService.getProjectDashboard(projectId, req.user.userId);
  }

  @Get('dashboard')
  async getWorkspaceDashboard(
    @Req() req: any,
    @Param('slug') slug: string,
  ) {
    return this.dashboardService.getWorkspaceDashboard(slug, req.user.userId);
  }
}
