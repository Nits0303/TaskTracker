import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { WorkspaceRoleGuard, RequireRole } from './guards/workspace-role.guard';
import { CreateWorkspaceSchema, UpdateWorkspaceSchema } from '@repo/shared';
import { z } from 'zod';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created.' })
  @Post()
  async createWorkspace(@Req() req: any, @Body() body: any) {
    const data = CreateWorkspaceSchema.parse(body);
    return this.workspaceService.createWorkspace(req.user.userId, data, req.ip);
  }

  @ApiOperation({ summary: 'Get current user workspaces' })
  @ApiResponse({ status: 200, description: 'List of workspaces.' })
  @Get()
  async getUserWorkspaces(@Req() req: any) {
    return this.workspaceService.getUserWorkspaces(req.user.userId);
  }

  @ApiOperation({ summary: 'Get workspace by slug' })
  @ApiResponse({ status: 200, description: 'Workspace details.' })
  @Get(':slug')
  async getWorkspaceBySlug(@Req() req: any, @Param('slug') slug: string) {
    return this.workspaceService.getWorkspaceBySlug(req.user.userId, slug);
  }

  @Patch(':slug')
  @RequireRole('Admin')
  async updateWorkspace(@Param('slug') slug: string, @Body() body: any, @Req() req: any) {
    const data = UpdateWorkspaceSchema.parse(body);
    return this.workspaceService.updateWorkspace(slug, data, req.user.userId, req.ip);
  }

  @Patch(':slug/archive')
  @RequireRole('Owner')
  async archiveWorkspace(@Param('slug') slug: string, @Req() req: any) {
    return this.workspaceService.archiveWorkspace(slug, req.user.userId, req.ip);
  }

  @Delete(':slug')
  @RequireRole('Owner')
  async deleteWorkspace(@Param('slug') slug: string, @Body() body: { name: string }, @Req() req: any) {
    return this.workspaceService.deleteWorkspace(slug, body.name, req.user.userId, req.ip);
  }

  @Post('invites/accept')
  async acceptInvite(@Req() req: any, @Body() body: { token: string }) {
    if (!body.token) throw new BadRequestException('Token is required');
    return this.workspaceService.acceptInvite(req.user.userId, body.token, req.ip);
  }

  @Post(':slug/members')
  @RequireRole('Admin')
  async inviteMember(@Param('slug') slug: string, @Body() body: any, @Req() req: any) {
    return this.workspaceService.inviteMember(slug, body, req.user.userId, req.workspace.id, req.ip);
  }

  @Patch(':slug/members/:userId/role')
  @RequireRole('Owner')
  async changeMemberRole(@Param('slug') slug: string, @Param('userId') userId: string, @Body() body: { role: any }, @Req() req: any) {
    return this.workspaceService.changeMemberRole(slug, userId, body.role, req.workspace.id, req.user.userId, req.ip);
  }

  @Delete(':slug/members/:userId')
  @RequireRole('Admin')
  async removeMember(@Param('slug') slug: string, @Param('userId') userId: string, @Req() req: any) {
    return this.workspaceService.removeMember(slug, userId, req.user.userId, req.userRole, req.workspace.id, req.ip);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(':slug/logo')
  @RequireRole('Admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@Param('slug') slug: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > 2 * 1024 * 1024) throw new BadRequestException('File too large (max 2MB)');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) throw new BadRequestException('Invalid file type');
    return this.workspaceService.uploadLogo(slug, file, req.user.userId, req.ip);
  }
}
