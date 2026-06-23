import { Controller, Get, Param, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { WorkloadService } from './workload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ToggleLeaveStatusDto } from './dto/workload.dto';

@ApiTags('Workload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:slug')
export class WorkloadController {
  constructor(private readonly workloadService: WorkloadService) {}

  @ApiOperation({ summary: 'Get project workload statistics' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Project workload data.' })
  @Get('projects/:projectId/workload')
  async getProjectWorkload(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
  ) {
    const userId = (req.user as any).userId;
    return this.workloadService.getProjectWorkload(userId, slug, projectId);
  }

  @ApiOperation({ summary: 'Get workspace workload statistics' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'Workspace workload data.' })
  @Get('workload')
  async getWorkspaceWorkload(
    @Req() req: any,
    @Param('slug') slug: string,
  ) {
    const userId = (req.user as any).userId;
    return this.workloadService.getWorkspaceWorkload(userId, slug);
  }

  @ApiOperation({ summary: 'Toggle member leave status' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'userId', description: 'User ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Leave status updated.' })
  @Patch('members/:userId/leave')
  async toggleLeaveStatus(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
    @Body() body: ToggleLeaveStatusDto,
  ) {
    const requesterId = (req.user as any).userId;
    return this.workloadService.toggleLeaveStatus(requesterId, slug, targetUserId, body.onLeave);
  }
}
