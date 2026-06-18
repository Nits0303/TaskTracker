import { Controller, Get, Param, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { WorkloadService } from './workload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:slug')
export class WorkloadController {
  constructor(private readonly workloadService: WorkloadService) {}

  @Get('projects/:projectId/workload')
  async getProjectWorkload(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
  ) {
    const userId = (req.user as any).userId;
    return this.workloadService.getProjectWorkload(userId, slug, projectId);
  }

  @Get('workload')
  async getWorkspaceWorkload(
    @Req() req: any,
    @Param('slug') slug: string,
  ) {
    const userId = (req.user as any).userId;
    return this.workloadService.getWorkspaceWorkload(userId, slug);
  }

  @Patch('members/:userId/leave')
  async toggleLeaveStatus(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
    @Body('onLeave') onLeave: boolean,
  ) {
    const requesterId = (req.user as any).userId;
    return this.workloadService.toggleLeaveStatus(requesterId, slug, targetUserId, onLeave);
  }
}
