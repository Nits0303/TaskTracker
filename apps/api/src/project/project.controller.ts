import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
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

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:slug/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created.' })
  @UseGuards(WorkspaceRoleGuard)
  @RequireWorkspaceRole(Role.Admin)
  @Post()
  async createProject(@CurrentUser() user: any, @Param('slug') slug: string, @Body() body: any) {
    // The shared CreateProjectSchema requires workspaceId, but our API is nested under slug.
    // For validation here, we validate name and description directly.
    const result = CreateProjectSchema.omit({ workspaceId: true }).safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.createProject(user.userId, slug, result.data);
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
  async updateProject(@Param('projectId') projectId: string, @Body() body: any) {
    const result = UpdateProjectSchema.omit({ workspaceId: true }).safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.updateProject(projectId, result.data);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Patch(':projectId/archive')
  async archiveProject(@Param('projectId') projectId: string) {
    return this.projectService.archiveProject(projectId);
  }

  @UseGuards(WorkspaceRoleGuard)
  @RequireWorkspaceRole(Role.Owner)
  @Delete(':projectId')
  async deleteProject(@Param('projectId') projectId: string, @Body() body: any) {
    if (!body.name) {
      throw new HttpException({ message: 'Project name is required for deletion confirmation' }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.deleteProject(projectId, body.name);
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
  async addMember(@Param('projectId') projectId: string, @Body() body: any) {
    if (!body.userId || !body.role) {
      throw new HttpException({ message: 'userId and role are required' }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.addMember(projectId, body.userId, body.role);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Patch(':projectId/members/:userId/role')
  async updateMemberRole(@Param('projectId') projectId: string, @Param('userId') targetUserId: string, @Body() body: any) {
    if (!body.role) {
      throw new HttpException({ message: 'role is required' }, HttpStatus.BAD_REQUEST);
    }
    return this.projectService.updateMemberRole(projectId, targetUserId, body.role);
  }

  @UseGuards(ProjectRoleGuard)
  @RequireProjectRole(Role.Admin)
  @Delete(':projectId/members/:userId')
  async removeMember(@Param('projectId') projectId: string, @Param('userId') targetUserId: string) {
    return this.projectService.removeMember(projectId, targetUserId);
  }
}
