import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { WorkspaceRoleGuard, RequireRole } from './guards/workspace-role.guard';
import { CreateWorkspaceSchema, UpdateWorkspaceSchema } from '@repo/shared';
import { z } from 'zod';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CreateWorkspaceDto, UpdateWorkspaceDto, DeleteWorkspaceDto, AcceptWorkspaceInviteDto, InviteMemberDto, ChangeMemberRoleDto } from './dto/workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Post()
  async createWorkspace(@Req() req: any, @Body() body: CreateWorkspaceDto) {
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
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'Workspace details.' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @Get(':slug')
  async getWorkspaceBySlug(@Req() req: any, @Param('slug') slug: string) {
    return this.workspaceService.getWorkspaceBySlug(req.user.userId, slug);
  }

  @ApiOperation({ summary: 'Update workspace details' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'Workspace updated.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Patch(':slug')
  @RequireRole('Admin')
  async updateWorkspace(@Param('slug') slug: string, @Body() body: UpdateWorkspaceDto, @Req() req: any) {
    const data = UpdateWorkspaceSchema.parse(body);
    return this.workspaceService.updateWorkspace(slug, data, req.user.userId, req.ip);
  }

  @ApiOperation({ summary: 'Archive a workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'Workspace archived.' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Patch(':slug/archive')
  @RequireRole('Owner')
  async archiveWorkspace(@Param('slug') slug: string, @Req() req: any) {
    return this.workspaceService.archiveWorkspace(slug, req.user.userId, req.ip);
  }

  @ApiOperation({ summary: 'Delete a workspace permanently' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'Workspace deleted.' })
  @ApiResponse({ status: 400, description: 'Validation error - name mismatch' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Delete(':slug')
  @RequireRole('Owner')
  async deleteWorkspace(@Param('slug') slug: string, @Body() body: DeleteWorkspaceDto, @Req() req: any) {
    return this.workspaceService.deleteWorkspace(slug, body.name, req.user.userId, req.ip);
  }

  @ApiOperation({ summary: 'Accept a workspace invite' })
  @ApiResponse({ status: 200, description: 'Invite accepted and joined workspace.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Post('invites/accept')
  async acceptInvite(@Req() req: any, @Body() body: AcceptWorkspaceInviteDto) {
    if (!body.token) throw new BadRequestException('Token is required');
    return this.workspaceService.acceptInvite(req.user.userId, body.token, req.ip);
  }

  @ApiOperation({ summary: 'Invite a member to the workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 201, description: 'Member invited successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Post(':slug/members')
  @RequireRole('Admin')
  async inviteMember(@Param('slug') slug: string, @Body() body: InviteMemberDto, @Req() req: any) {
    return this.workspaceService.inviteMember(slug, body, req.user.userId, req.workspace.id, req.ip);
  }

  @ApiOperation({ summary: 'Change a member role in the workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'userId', description: 'User ID of the member', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Member role updated.' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Patch(':slug/members/:userId/role')
  @RequireRole('Owner')
  async changeMemberRole(@Param('slug') slug: string, @Param('userId') userId: string, @Body() body: ChangeMemberRoleDto, @Req() req: any) {
    return this.workspaceService.changeMemberRole(slug, userId, body.role, req.workspace.id, req.user.userId, req.ip);
  }

  @ApiOperation({ summary: 'Remove a member from the workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'userId', description: 'User ID to remove', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Member removed.' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Delete(':slug/members/:userId')
  @RequireRole('Admin')
  async removeMember(@Param('slug') slug: string, @Param('userId') userId: string, @Req() req: any) {
    return this.workspaceService.removeMember(slug, userId, req.user.userId, req.userRole, req.workspace.id, req.ip);
  }

  @ApiOperation({ summary: 'Upload a new logo for the workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Logo uploaded successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
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
