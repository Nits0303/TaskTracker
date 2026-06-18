import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleDueDateReminders() {
    this.logger.log('Running due date reminders scheduler...');
    
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: 'Completed' },
        dueDate: {
          gte: now,
          lte: tomorrow,
        },
        reminderSent: false,
        assigneeId: { not: null },
      },
      include: {
        assignee: true,
      }
    });

    for (const task of tasks) {
      if (!task.assigneeId) continue;

      // Update the flag first to prevent race conditions if jobs overlap
      await this.prisma.task.update({
        where: { id: task.id },
        data: { reminderSent: true },
      });

      await this.notificationService.dispatch({
        recipientId: task.assigneeId,
        type: 'due_reminder',
        message: `Task "${task.title}" is due within 24 hours.`,
        referenceId: task.id,
      });

      this.logger.log(`Dispatched reminder for task ${task.id}`);
    }
  }
}
