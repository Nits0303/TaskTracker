import {
  Controller, Get, Post, Patch, Param, Body, Req, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, UploadedFile, Delete
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { WorkspaceRoleGuard, RequireRole } from '../workspace/guards/workspace-role.guard';
import { Role } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateDirectMessageDto, UpdateMessageDto, MarkReadDto } from './dto/chat.dto';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:slug/conversations')
export class ConversationController {
  constructor(private readonly chatService: ChatService) {}

  @ApiOperation({ summary: 'Get all direct conversations in a workspace' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'List of conversations.' })
  @Get()
  @RequireRole(Role.Viewer)
  async getConversations(@Req() req: any, @Param('slug') slug: string) {
    return this.chatService.getConversations(req.user.userId, slug);
  }

  @ApiOperation({ summary: 'Create a direct message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiResponse({ status: 201, description: 'Message created.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('messages')
  @RequireRole(Role.Viewer)
  async createMessage(@Req() req: any, @Param('slug') slug: string, @Body() body: CreateDirectMessageDto) {
    if (!body.channelId && !body.targetUserId) {
      throw new HttpException({ message: 'Either channelId or targetUserId is required' }, HttpStatus.BAD_REQUEST);
    }
    return this.chatService.createDirectMessage(req.user.userId, slug, body);
  }

  @ApiOperation({ summary: 'Get messages for a conversation channel' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiQuery({ name: 'before', required: false, description: 'Cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiResponse({ status: 200, description: 'List of messages.' })
  @Get(':channelId/messages')
  @RequireRole(Role.Viewer)
  async getMessages(@Req() req: any, @Param('channelId') channelId: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(parseInt(limit), 100) : 50;
    return this.chatService.getMessages(req.user.userId, channelId, before, take);
  }

  @ApiOperation({ summary: 'Mark a direct message as read' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Read receipt updated.' })
  @Patch(':channelId/read')
  @RequireRole(Role.Viewer)
  async markRead(@Req() req: any, @Param('channelId') channelId: string, @Body() body: MarkReadDto) {
    if (!body.messageId) throw new HttpException({ message: 'messageId is required' }, HttpStatus.BAD_REQUEST);
    return this.chatService.markRead(req.user.userId, channelId, body.messageId);
  }

  @ApiOperation({ summary: 'Upload an attachment to a direct message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Attachment uploaded.' })
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

  @ApiOperation({ summary: 'Get list of users who have read a direct message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'List of seen-by users.' })
  @Get(':channelId/messages/:messageId/seen-by')
  @RequireRole(Role.Viewer)
  async getSeenBy(@Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.getSeenBy(channelId, messageId);
  }

  @ApiOperation({ summary: 'Delete a direct message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Message deleted.' })
  @Delete(':channelId/messages/:messageId')
  @RequireRole(Role.Viewer)
  async deleteMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.chatService.deleteMessage(req.user.userId, channelId, messageId);
  }

  @ApiOperation({ summary: 'Update a direct message' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', example: 'uuid-here' })
  @ApiParam({ name: 'messageId', description: 'Message ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Message updated.' })
  @Patch(':channelId/messages/:messageId')
  @RequireRole(Role.Viewer)
  async updateMessage(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string, @Body() body: UpdateMessageDto) {
    return this.chatService.updateMessage(req.user.userId, channelId, messageId, body);
  }
}
