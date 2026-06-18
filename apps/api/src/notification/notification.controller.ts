import { Controller, Get, Query, Patch, Param, Delete, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private prisma: PrismaService) {}

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

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    return this.prisma.notification.update({
      where: { id, recipientId: req.user.userId },
      data: { isRead: true },
    });
  }

  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    await this.prisma.notification.updateMany({
      where: { recipientId: req.user.userId, isDismissed: false, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  @Delete(':id')
  async dismiss(@Param('id') id: string, @Req() req: any) {
    await this.prisma.notification.update({
      where: { id, recipientId: req.user.userId },
      data: { isDismissed: true },
    });
    return { success: true };
  }

  @Post('push-subscription')
  async savePushSubscription(@Req() req: any, @Body() body: any) {
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

  @Delete('push-subscription')
  async removePushSubscription(@Req() req: any) {
    await this.prisma.pushSubscription.delete({
      where: { userId: req.user.userId },
    }).catch(() => null); // Ignore if not found
    return { success: true };
  }

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

  @Patch('preferences')
  async updatePreferences(@Req() req: any, @Body() body: { emailEnabled?: boolean, pushEnabled?: boolean }) {
    const data: any = {};
    if (body.emailEnabled !== undefined) data.emailEnabled = body.emailEnabled;
    if (body.pushEnabled !== undefined) data.pushEnabled = body.pushEnabled;

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
