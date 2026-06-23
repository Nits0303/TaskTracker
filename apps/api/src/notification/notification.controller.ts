import { Controller, Get, Query, Patch, Param, Delete, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PushSubscriptionDto, UpdatePreferencesDto } from './dto/notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private prisma: PrismaService) {}

  @ApiOperation({ summary: 'Get recent notifications for the current user' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of notifications to return (max 100)' })
  @ApiResponse({ status: 200, description: 'List of notifications and unread count.' })
  @Get()
  async getNotifications(@Req() req: any, @Query('limit') limit: any = 20) {
    const userId = req.user.userId;
    const take = Math.min(100, parseInt(limit, 10));

    const notifications = await this.prisma.notification.findMany({
      where: { recipientId: userId, isDismissed: false },
      orderBy: { createdAt: 'desc' },
      take,
    });

    const persistent = notifications.filter(n => n.type === 'meeting_request');
    const standard = notifications.filter(n => n.type !== 'meeting_request');
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId: userId, isDismissed: false, isRead: false }
    });

    return { persistent, standard, unreadCount };
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    return this.prisma.notification.update({
      where: { id, recipientId: req.user.userId },
      data: { isRead: true },
    });
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read.' })
  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    await this.prisma.notification.updateMany({
      where: { recipientId: req.user.userId, isDismissed: false, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  @ApiOperation({ summary: 'Dismiss a notification' })
  @ApiParam({ name: 'id', description: 'Notification ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Notification dismissed.' })
  @Delete(':id')
  async dismiss(@Param('id') id: string, @Req() req: any) {
    await this.prisma.notification.update({
      where: { id, recipientId: req.user.userId },
      data: { isDismissed: true },
    });
    return { success: true };
  }

  @ApiOperation({ summary: 'Save push notification subscription' })
  @ApiResponse({ status: 201, description: 'Push subscription saved.' })
  @Post('push-subscription')
  async savePushSubscription(@Req() req: any, @Body() body: PushSubscriptionDto) {
    const { endpoint, keys } = body;
    if (!endpoint || !keys || !keys.auth || !keys.p256dh) {
      return { success: false, error: 'Invalid subscription object' };
    }

    await this.prisma.pushSubscription.upsert({
      where: { userId: req.user.userId },
      update: {
        endpoint,
        auth: keys.auth,
        p256dh: keys.p256dh,
      },
      create: {
        userId: req.user.userId,
        endpoint,
        auth: keys.auth,
        p256dh: keys.p256dh,
      }
    });

    return { success: true };
  }

  @ApiOperation({ summary: 'Remove push notification subscription' })
  @ApiResponse({ status: 200, description: 'Push subscription removed.' })
  @Delete('push-subscription')
  async removePushSubscription(@Req() req: any) {
    await this.prisma.pushSubscription.delete({
      where: { userId: req.user.userId },
    }).catch(() => null); // Ignore if not found
    return { success: true };
  }

  @ApiOperation({ summary: 'Get current user notification preferences' })
  @ApiResponse({ status: 200, description: 'Notification preferences.' })
  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId: req.user.userId }
    });
    if (!prefs) {
      return { emailEnabled: true, pushEnabled: false };
    }
    return prefs;
  }

  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Notification preferences updated.' })
  @Patch('preferences')
  async updatePreferences(@Req() req: any, @Body() body: UpdatePreferencesDto) {
    const data: any = {};
    
    // Legacy flags
    if (body.emailEnabled !== undefined) data.emailEnabled = body.emailEnabled;
    if (body.pushEnabled !== undefined) data.pushEnabled = body.pushEnabled;
    
    // Granular Email
    if (body.emailTaskAssignments !== undefined) data.emailTaskAssignments = body.emailTaskAssignments;
    if (body.emailMentions !== undefined) data.emailMentions = body.emailMentions;
    if (body.emailTaskDeadlines !== undefined) data.emailTaskDeadlines = body.emailTaskDeadlines;
    
    // Granular In-App
    if (body.inAppTaskAssignments !== undefined) data.inAppTaskAssignments = body.inAppTaskAssignments;
    if (body.inAppMentions !== undefined) data.inAppMentions = body.inAppMentions;
    if (body.inAppTaskDeadlines !== undefined) data.inAppTaskDeadlines = body.inAppTaskDeadlines;
    if (body.inAppTaskUpdates !== undefined) data.inAppTaskUpdates = body.inAppTaskUpdates;
    if (body.inAppCalendarEvents !== undefined) data.inAppCalendarEvents = body.inAppCalendarEvents;
    if (body.inAppMemberJoined !== undefined) data.inAppMemberJoined = body.inAppMemberJoined;
    if (body.inAppDirectMessages !== undefined) data.inAppDirectMessages = body.inAppDirectMessages;

    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId: req.user.userId },
      update: data,
      create: {
        userId: req.user.userId,
        ...data,
      }
    });
    return prefs;
  }
}
