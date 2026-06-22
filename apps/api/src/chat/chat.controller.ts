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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('workspaces/:slug/projects/:projectId/channels')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @RequireProjectRole(Role.Admin) // Project Admin and Workspace Owner (handled by hierarchy)
  async createChannel(@Req() req: any, @Param('projectId') projectId: string, @Body() body: any) {
    if (!body.name) throw new HttpException({ message: 'Channel name is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.createChannel(req.user.userId, projectId, body);
  }

  @Get()
  @RequireProjectRole(Role.Viewer)
  async getChannels(@Req() req: any, @Param('projectId') projectId: string) {
    return this.chatService.getChannels(req.user.userId, projectId);
  }

  @Get(':channelId')
  @RequireProjectRole(Role.Viewer)
  async getChannel(@Req() req: any, @Param('channelId') channelId: string) {
    return this.chatService.getChannel(req.user.userId, channelId);
  }

  @Patch(':channelId')
  @RequireProjectRole(Role.Admin)
  async updateChannel(@Req() req: any, @Param('channelId') channelId: string, @Body() body: any) {
    return this.chatService.updateChannel(req.user.userId, channelId, body);
  }

  @Post(':channelId/members')
  @RequireProjectRole(Role.Admin)
  async addMember(@Req() req: any, @Param('channelId') channelId: string, @Body() body: any) {
    return this.chatService.addMember(req.user.userId, channelId, body.userId);
  }

  @Delete(':channelId/members/:userId')
  @RequireProjectRole(Role.Admin)
  async removeMember(@Req() req: any, @Param('channelId') channelId: string, @Param('userId') targetUserId: string) {
    return this.chatService.removeMember(req.user.userId, channelId, targetUserId);
  }

  @Delete(':channelId')
  @RequireProjectRole(Role.Admin)
  async deleteChannel(@Param('channelId') channelId: string, @Body() body: any) {
    if (!body.name) throw new HttpException({ message: 'Channel name is required to confirm deletion' }, HttpStatus.BAD_REQUEST);
    return this.chatService.deleteChannel(channelId, body.name);
  }

  // --- Messages ---
  @Get(':channelId/messages')
  @RequireProjectRole(Role.Viewer)
  async getMessages(@Req() req: any, @Param('channelId') channelId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    return this.chatService.getMessages(req.user.userId, channelId, before, take);
  }

  @Get(':channelId/messages/:messageId/thread')
  @RequireProjectRole(Role.Viewer)
  async getThread(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    return this.chatService.getThread(req.user.userId, channelId, messageId, before, take);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':channelId/messages')
  @RequireProjectRole(Role.Viewer)
  async createMessage(@Req() req: any, @Param('projectId') projectId: string, @Param('channelId') channelId: string, @Body() body: any) {
    return this.chatService.createMessage(req.user.userId, projectId, channelId, body);
  }

  @Patch(':channelId/messages/:messageId')
  @RequireProjectRole(Role.Viewer)
  async updateMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string, @Body() body: any) {
    return this.chatService.updateMessage(req.user.userId, channelId, messageId, body);
  }

  @Delete(':channelId/messages/:messageId')
  @RequireProjectRole(Role.Viewer)
  async deleteMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.deleteMessage(req.user.userId, channelId, messageId);
  }

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
  @Patch(':channelId/read')
  @RequireProjectRole(Role.Viewer)
  async markRead(@Req() req: any, @Param('channelId') channelId: string, @Body() body: any) {
    if (!body.messageId) throw new HttpException({ message: 'messageId is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.markRead(req.user.userId, channelId, body.messageId);
  }

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

  @Patch('channels/:channelId/mute')
  @RequireProjectRole(Role.Viewer)
  async muteChannel(@Req() req: any, @Param('channelId') channelId: string, @Body() body: { duration: string }) {
    return this.chatService.muteChannel(req.user.userId, channelId, body.duration);
  }

  @Delete('channels/:channelId/mute')
  @RequireProjectRole(Role.Viewer)
  async unmuteChannel(@Req() req: any, @Param('channelId') channelId: string) {
    return this.chatService.unmuteChannel(req.user.userId, channelId);
  }

  @Patch('chat/mute')
  @RequireProjectRole(Role.Viewer)
  async muteProjectChat(@Req() req: any, @Param('projectId') projectId: string, @Body() body: { duration: string }) {
    return this.chatService.muteProjectChat(req.user.userId, projectId, body.duration);
  }

  @Delete('chat/mute')
  @RequireProjectRole(Role.Viewer)
  async unmuteProjectChat(@Req() req: any, @Param('projectId') projectId: string) {
    return this.chatService.unmuteProjectChat(req.user.userId, projectId);
  }

  @Get('chat/mute-status')
  @RequireProjectRole(Role.Viewer)
  async getMuteStatus(@Req() req: any, @Param('projectId') projectId: string) {
    return this.chatService.getMuteStatus(req.user.userId, projectId);
  }
}
