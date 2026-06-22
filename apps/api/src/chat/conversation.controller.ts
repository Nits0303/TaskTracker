import {
  Controller, Get, Post, Patch, Param, Body, Req, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, UploadedFile, Delete
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { WorkspaceRoleGuard, RequireRole } from '../workspace/guards/workspace-role.guard';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:slug/conversations')
export class ConversationController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @RequireRole(Role.Viewer)
  async getConversations(@Req() req: any, @Param('slug') slug: string) {
    return this.chatService.getConversations(req.user.userId, slug);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('messages')
  @RequireRole(Role.Viewer)
  async createMessage(@Req() req: any, @Param('slug') slug: string, @Body() body: any) {
    if (!body.channelId && !body.targetUserId) {
      throw new HttpException({ message: 'Either channelId or targetUserId is required' }, HttpStatus.BAD_REQUEST);
    }
    return this.chatService.createDirectMessage(req.user.userId, slug, body);
  }

  @Get(':channelId/messages')
  @RequireRole(Role.Viewer)
  async getMessages(@Req() req: any, @Param('channelId') channelId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    return this.chatService.getMessages(req.user.userId, channelId, before, take);
  }

  @Patch(':channelId/read')
  @RequireRole(Role.Viewer)
  async markRead(@Req() req: any, @Param('channelId') channelId: string, @Body() body: any) {
    if (!body.messageId) throw new HttpException({ message: 'messageId is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.markRead(req.user.userId, channelId, body.messageId);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':channelId/messages/:messageId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @RequireRole(Role.Viewer)
  async uploadAttachment(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!file) throw new HttpException({ message: 'File is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.uploadAttachment(req.user.userId, slug, 'direct', channelId, messageId, file);
  }

  @Get(':channelId/messages/:messageId/seen-by')
  @RequireRole(Role.Viewer)
  async getSeenBy(@Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.getSeenBy(channelId, messageId);
  }

  @Delete(':channelId/messages/:messageId')
  @RequireRole(Role.Viewer)
  async deleteMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.deleteMessage(req.user.userId, channelId, messageId);
  }

  @Patch(':channelId/messages/:messageId')
  @RequireRole(Role.Viewer)
  async updateMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string, @Body() body: any) {
    return this.chatService.updateMessage(req.user.userId, channelId, messageId, body);
  }
}
