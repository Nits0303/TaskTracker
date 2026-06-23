import {
  Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards, Query, UseInterceptors, UploadedFile, HttpException, HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { ProjectRoleGuard } from '../project/guards/project-role.guard';
import { RequireProjectRole } from '../project/decorators/require-project-role.decorator';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CreateChannelDto, UpdateChannelDto, AddChannelMemberDto, DeleteChannelDto, CreateMessageDto, UpdateMessageDto, MarkReadDto, MuteDurationDto } from './dto/chat.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('workspaces/:slug/projects/:projectId/channels')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({ summary: 'Create a new chat channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Channel created.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Post()
  @RequireProjectRole(Role.Admin) // Project Admin and Workspace Owner (handled by hierarchy)
  async createChannel(@Req() req: any, @Param('projectId') projectId: string, @Body() body: CreateChannelDto) {
    if (!body.name) throw new HttpException({ message: 'Channel name is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.createChannel(req.user.userId, projectId, body);
  }

  @ApiOperation({ summary: 'Get all channels in a project' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'List of channels.' })
  @Get()
  @RequireProjectRole(Role.Viewer)
  async getChannels(@Req() req: any, @Param('projectId') projectId: string) {
    return this.chatService.getChannels(req.user.userId, projectId);
  }

  @ApiOperation({ summary: 'Get details of a specific channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Channel details.' })
  @Get(':channelId')
  @RequireProjectRole(Role.Viewer)
  async getChannel(@Req() req: any, @Param('channelId') channelId: string) {
    return this.chatService.getChannel(req.user.userId, channelId);
  }

  @ApiOperation({ summary: 'Update a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Channel updated.' })
  @Patch(':channelId')
  @RequireProjectRole(Role.Admin)
  async updateChannel(@Req() req: any, @Param('channelId') channelId: string, @Body() body: UpdateChannelDto) {
    return this.chatService.updateChannel(req.user.userId, channelId, body);
  }

  @ApiOperation({ summary: 'Add a member to a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Member added.' })
  @Post(':channelId/members')
  @RequireProjectRole(Role.Admin)
  async addMember(@Req() req: any, @Param('channelId') channelId: string, @Body() body: AddChannelMemberDto) {
    return this.chatService.addMember(req.user.userId, channelId, body.userId);
  }

  @ApiOperation({ summary: 'Remove a member from a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'userId', description: 'User ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Member removed.' })
  @Delete(':channelId/members/:userId')
  @RequireProjectRole(Role.Admin)
  async removeMember(@Req() req: any, @Param('channelId') channelId: string, @Param('userId') targetUserId: string) {
    return this.chatService.removeMember(req.user.userId, channelId, targetUserId);
  }

  @ApiOperation({ summary: 'Delete a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Channel deleted.' })
  @Delete(':channelId')
  @RequireProjectRole(Role.Admin)
  async deleteChannel(@Param('channelId') channelId: string, @Body() body: DeleteChannelDto) {
    if (!body.name) throw new HttpException({ message: 'Channel name is required to confirm deletion' }, HttpStatus.BAD_REQUEST);
    return this.chatService.deleteChannel(channelId, body.name);
  }

  // --- Messages ---
  @ApiOperation({ summary: 'Get messages for a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiQuery({ name: 'before', required: false, description: 'Cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiResponse({ status: 200, description: 'List of messages.' })
  @Get(':channelId/messages')
  @RequireProjectRole(Role.Viewer)
  async getMessages(@Req() req: any, @Param('channelId') channelId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    return this.chatService.getMessages(req.user.userId, channelId, before, take);
  }

  @ApiOperation({ summary: 'Get thread messages' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Parent Message ID', example: 'uuid-here' })
  @ApiQuery({ name: 'before', required: false, description: 'Cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiResponse({ status: 200, description: 'List of thread messages.' })
  @Get(':channelId/messages/:messageId/thread')
  @RequireProjectRole(Role.Viewer)
  async getThread(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    return this.chatService.getThread(req.user.userId, channelId, messageId, before, take);
  }

  @ApiOperation({ summary: 'Create a message in a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Message created.' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':channelId/messages')
  @RequireProjectRole(Role.Viewer)
  async createMessage(@Req() req: any, @Param('projectId') projectId: string, @Param('channelId') channelId: string, @Body() body: CreateMessageDto) {
    return this.chatService.createMessage(req.user.userId, projectId, channelId, body);
  }

  @ApiOperation({ summary: 'Update a message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Message updated.' })
  @Patch(':channelId/messages/:messageId')
  @RequireProjectRole(Role.Viewer)
  async updateMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string, @Body() body: UpdateMessageDto) {
    return this.chatService.updateMessage(req.user.userId, channelId, messageId, body);
  }

  @ApiOperation({ summary: 'Delete a message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Message deleted.' })
  @Delete(':channelId/messages/:messageId')
  @RequireProjectRole(Role.Viewer)
  async deleteMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.deleteMessage(req.user.userId, channelId, messageId);
  }

  @ApiOperation({ summary: 'Upload an attachment to a message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Attachment uploaded.' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':channelId/messages/:messageId/attachments')
  @RequireProjectRole(Role.Viewer)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) throw new HttpException({ message: 'File is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.uploadAttachment(req.user.userId, slug, projectId, channelId, messageId, file);
  }

  // --- Read Receipts ---
  @ApiOperation({ summary: 'Mark a message as read' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Read receipt updated.' })
  @Patch(':channelId/read')
  @RequireProjectRole(Role.Viewer)
  async markRead(@Req() req: any, @Param('channelId') channelId: string, @Body() body: MarkReadDto) {
    if (!body.messageId) throw new HttpException({ message: 'messageId is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.markRead(req.user.userId, channelId, body.messageId);
  }

  @ApiOperation({ summary: 'Get list of users who have read a message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'List of seen-by users.' })
  @Get(':channelId/messages/:messageId/seen-by')
  @RequireProjectRole(Role.Viewer)
  async getSeenBy(@Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.getSeenBy(channelId, messageId);
  }
}

@ApiTags('Chat Mute')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('workspaces/:slug/projects/:projectId')
export class ChatMuteController {
  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({ summary: 'Mute a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Channel muted.' })
  @Patch('channels/:channelId/mute')
  @RequireProjectRole(Role.Viewer)
  async muteChannel(@Req() req: any, @Param('channelId') channelId: string, @Body() body: MuteDurationDto) {
    return this.chatService.muteChannel(req.user.userId, channelId, body.duration);
  }

  @ApiOperation({ summary: 'Unmute a channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Channel unmuted.' })
  @Delete('channels/:channelId/mute')
  @RequireProjectRole(Role.Viewer)
  async unmuteChannel(@Req() req: any, @Param('channelId') channelId: string) {
    return this.chatService.unmuteChannel(req.user.userId, channelId);
  }

  @ApiOperation({ summary: 'Mute all project chat' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Project chat muted.' })
  @Patch('chat/mute')
  @RequireProjectRole(Role.Viewer)
  async muteProjectChat(@Req() req: any, @Param('projectId') projectId: string, @Body() body: MuteDurationDto) {
    return this.chatService.muteProjectChat(req.user.userId, projectId, body.duration);
  }

  @ApiOperation({ summary: 'Unmute all project chat' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Project chat unmuted.' })
  @Delete('chat/mute')
  @RequireProjectRole(Role.Viewer)
  async unmuteProjectChat(@Req() req: any, @Param('projectId') projectId: string) {
    return this.chatService.unmuteProjectChat(req.user.userId, projectId);
  }

  @ApiOperation({ summary: 'Get mute status for a project' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Mute status details.' })
  @Get('chat/mute-status')
  @RequireProjectRole(Role.Viewer)
  async getMuteStatus(@Req() req: any, @Param('projectId') projectId: string) {
    return this.chatService.getMuteStatus(req.user.userId, projectId);
  }
}
