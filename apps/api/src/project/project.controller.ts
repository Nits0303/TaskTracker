import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, HttpException, HttpStatus, Req, Query } from '@nestjs/common';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard } from '../workspace/guards/workspace-role.guard';
import { ProjectRoleGuard } from './guards/project-role.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRole as RequireWorkspaceRole } from '../workspace/guards/workspace-role.guard';
import { RequireProjectRole } from './decorators/require-project-role.decorator';
import { Role } from '@prisma/client';
import { CreateProjectSchema, UpdateProjectSchema } from '@repo/shared';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:slug/projects')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly prisma: PrismaService,
  ) {}

  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created.' })
  @UseGuards(WorkspaceRoleGuard)
  @RequireWorkspaceRole(Role.Admin)
  @Post()
  async createProject(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any, @Req() req: any) {
    // The shared CreateProjectSchema requires workspaceId, but our API is nested under slug.
    // For validation here, we validate name and description directly.
    const result = CreateProjectSchema.omit({ workspaceId: true }).safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.createProject(user.userId, slug, result.data, req.ip);
  }

  @ApiOperation({ summary: 'Get all projects in workspace' })
  @ApiResponse({ status: 200, description: 'List of projects.' })
  @UseGuards(WorkspaceRoleGuard)
  @RequireWorkspaceRole(Role.Viewer)
  @Get()
  async getProjects(@CurrentUser() user: any, @Param('slug') slug: string) {
    return this.projectService.getProjects(user.userId, slug);
  }

  @ApiOperation({ summary: 'Get a specific project' })
  @ApiResponse({ status: 200, description: 'Project details.' })
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Viewer)
  @Get(':projectId')
  async getProject(@CurrentUser() user: any, @Param('projectId') projectId: string) {
    return this.projectService.getProject(user.userId, projectId);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Patch(':projectId')
  async updateProject(@Param('projectId') projectId: string, @Body() body: any, @CurrentUser() user: any, @Req() req: any) {
    const result = UpdateProjectSchema.omit({ workspaceId: true }).safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.updateProject(projectId, result.data, user.userId, req.ip);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Patch(':projectId/archive')
  async archiveProject(@Param('projectId') projectId: string, @CurrentUser() user: any, @Req() req: any) {
    return this.projectService.archiveProject(projectId, user.userId, req.ip);
  }

  @ApiOperation({ summary: 'Get project audit logs' })
  @ApiResponse({ status: 200, description: 'List of project audit logs.' })
  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Get(':projectId/audit-logs')
  async getProjectAuditLogs(
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Query('page') pageStr: string,
    @Query('limit') limitStr: string,
    @Query('event') event: string,
    @Query('actorId') actorId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });

    if (!project) {
      throw new HttpException({ message: 'Project not found' }, HttpStatus.NOT_FOUND);
    }

    const page = Math.max(1, parseInt(pageStr || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(limitStr || '20', 10)));
    
    const projectEvents = [
      'TASK_CREATED', 'TASK_DELETED',
      'TASK_STATUS_CHANGED', 'TASK_ASSIGNEE_CHANGED', 'TASK_DESCRIPTION_CHANGED', 'TASK_DUE_DATE_CHANGED',
      'SUBTASK_CREATED', 'SUBTASK_ASSIGNED',
      'COMMENT_ADDED', 'COMMENT_DELETED_BY_ADMIN',
      'ATTACHMENT_UPLOADED', 'ATTACHMENT_DELETED',
      'MEETING_REQUESTED',
      'PROJECT_SETTINGS_CHANGED', 'PROJECT_MEMBER_ROLE_CHANGED'
    ];

    const where: any = {
      workspaceId: project.workspaceId,
    };

    if (event) {
      const events = event.split(',').filter(e => projectEvents.includes(e));
      if (events.length > 0) {
        where.event = { in: events };
      } else {
        where.event = { in: projectEvents };
      }
    } else {
      where.event = { in: projectEvents };
    }

    if (actorId) {
      where.actorId = actorId;
    }

    const now = new Date();
    const maxDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    let fromDate = from ? new Date(from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let toDate = to ? new Date(to) : now;

    if (fromDate < maxDate) {
      fromDate = maxDate;
    }

    where.createdAt = {
      gte: fromDate,
      lte: toDate,
    };

    // Filter by resourceId or metadata->projectId
    where.OR = [
      { resourceId: projectId },
      { metadata: { path: ['projectId'], equals: projectId } }
    ];

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: {
            select: { id: true, fullName: true, email: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  @UseGuards(WorkspaceRoleGuard)
  @RequireWorkspaceRole(Role.Owner)
  @Delete(':projectId')
  async deleteProject(@Param('projectId') projectId: string, @Body() body: any, @CurrentUser() user: any, @Req() req: any) {
    if (!body.name) {
      throw new HttpException({ message: 'Project name is required for deletion confirmation' }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.deleteProject(projectId, body.name, user.userId, req.ip);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Viewer)
  @Get(':projectId/members')
  async getMembers(@Param('projectId') projectId: string) {
    return this.projectService.getMembers(projectId);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Post(':projectId/members')
  async addMember(@Param('projectId') projectId: string, @Body() body: any, @CurrentUser() user: any, @Req() req: any) {
    if (!body.userId || !body.role) {
      throw new HttpException({ message: 'userId and role are required' }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.addMember(projectId, body.userId, body.role, user.userId, req.ip);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Patch(':projectId/members/:userId/role')
  async updateMemberRole(@Param('projectId') projectId: string, @Param('userId') targetUserId: string, @Body() body: any, @CurrentUser() user: any, @Req() req: any) {
    if (!body.role) {
      throw new HttpException({ message: 'role is required' }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.updateMemberRole(projectId, targetUserId, body.role, user.userId, req.ip);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Delete(':projectId/members/:userId')
  async removeMember(@Param('projectId') projectId: string, @Param('userId') targetUserId: string, @CurrentUser() user: any, @Req() req: any) {
    return this.projectService.removeMember(projectId, targetUserId, user.userId, req.ip);
  }
}
