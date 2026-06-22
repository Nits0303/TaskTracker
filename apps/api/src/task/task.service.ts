import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, TaskStatus, ActivityEventType, AuditEventType } from '@prisma/client';
import { AuditLogService } from '../audit/audit.service';
import { ALLOWED_STATUS_TRANSITIONS } from '@repo/shared';
import * as Minio from 'minio';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ActivityService } from '../activity/activity.service';
import { NotificationService } from '../notification/notification.service';
import { REDIS_CLIENT } from '../realtime/redis.module';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';

@Injectable()
export class TaskService {
  private minioClient: Minio.Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeGateway,
    private readonly activity: ActivityService,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.minioClient = new Minio.Client({
      endPoint: this.config.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.config.get('MINIO_PORT', '9000')),
      useSSL: this.config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  private get bucket(): string {
    return this.config.get('MINIO_BUCKET', 'task-tracker');
  }

  private async clearDashboardCache(projectId: string) {
    try {
      const keys = await this.redis.keys(`dashboard:project:${projectId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspace: { select: { slug: true } } } });
      if (project) {
        const wsKeys = await this.redis.keys(`dashboard:workspace:${project.workspace.slug}:*`);
        if (wsKeys.length > 0) {
          await this.redis.del(...wsKeys);
        }
      }
    } catch (e) {
      console.error('Failed to clear dashboard cache', e);
    }
  }

  // --- Ownership check ---
  async canMutateTask(userId: string, projectId: string, taskId: string): Promise<boolean> {
    const [task, projectMember] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true } }),
      this.prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } }
      })
    ]);

    if (!task) throw new NotFoundException('Task not found');
    if (task.assigneeId === userId) return true;
    if (projectMember && (projectMember.role === Role.Admin || projectMember.role === Role.Owner)) return true;

    // Check workspace admin
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (project) {
      const wsMember = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } }
      });
      if (wsMember && (wsMember.role === Role.Admin || wsMember.role === Role.Owner)) return true;
    }
    return false;
  }

  private taskSelectFields() {
    return {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      startTime: true,
      endTime: true,
      sortOrder: true,
      label: true,
      projectId: true,
      assigneeId: true,
      parentTaskId: true,
      createdAt: true,
      updatedAt: true,
      assignee: {
        select: { id: true, fullName: true, avatarUrl: true, email: true }
      },
      _count: {
        select: { checklistItems: true, comments: true, attachments: true }
      },
      checklistItems: {
        select: { isDone: true }
      }
    };
  }

  // --- Task CRUD ---
  async createTask(userId: string, projectId: string, data: any, socketId?: string) {
    // Get highest sort order in target column
    const highestOrder = await this.prisma.task.findFirst({
      where: { projectId, status: data.status || TaskStatus.Todo },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true }
    });

    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        status: data.status || TaskStatus.Todo,
        priority: data.priority || 'Medium',
        dueDate: data.dueDate,
        startTime: data.startTime,
        endTime: data.endTime,
        sortOrder: (highestOrder?.sortOrder ?? -1) + 1,
        label: data.label,
        projectId,
        assigneeId: data.assigneeId,
      },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true } }
      }
    });

    // Create CalendarBlock if time range provided
    if (data.assigneeId && data.startTime && data.endTime) {
      await this.prisma.calendarBlock.create({
        data: {
          userId: data.assigneeId,
          taskId: task.id,
          startDatetime: data.startTime,
          endDatetime: data.endTime,
          label: task.title,
        }
      });
    }

    this.realtime.emitToProject(projectId, 'task:created', task, socketId);
    this.activity.logEvent({
      eventType: ActivityEventType.TaskCreated,
      actorId: userId,
      projectId,
      taskId: task.id,
    });
    
    if (data.assigneeId && data.assigneeId !== userId) {
      const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      await this.notificationService.dispatch({
        recipientId: data.assigneeId,
        type: 'task_assigned',
        message: `${actor?.fullName || 'Someone'} assigned you to task "${task.title}".`,
        referenceId: task.id,
      });
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (project) {
      await this.auditLogService.log({
        event: AuditEventType.TASK_CREATED,
        workspaceId: project.workspaceId,
        actorId: userId,
        resourceType: 'Task',
        resourceId: task.id,
        metadata: { projectId, taskTitle: task.title }
      });
    }

    await this.clearDashboardCache(projectId);
    
    return task;
  }

  async getTasks(projectId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { projectId, parentTaskId: null },
      select: this.taskSelectFields(),
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }],
      take: 100
    });

    return tasks.map(t => ({
      ...t,
      subTaskCount: t.checklistItems.length,
      completedSubTaskCount: t.checklistItems.filter(st => st.isDone).length,
      commentCount: t._count.comments,
      attachmentCount: t._count.attachments,
      checklistItems: undefined,
      _count: undefined,
    }));
  }

  async getTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        checklistItems: {
          orderBy: { createdAt: 'asc' },
          include: {
            assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true } }
          }
        },
        _count: { select: { comments: true, attachments: true } }
      }
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async updateTask(userId: string, projectId: string, taskId: string, data: any, socketId?: string) {
    const canMutate = await this.canMutateTask(userId, projectId, taskId);
    if (!canMutate) throw new ForbiddenException('Not allowed to update this task');

    const oldTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { status: true, assigneeId: true, version: true, description: true, dueDate: true, title: true, assignee: { select: { fullName: true } } }
    });

    if (!oldTask) throw new NotFoundException('Task not found');

    if (data.version !== undefined && data.version !== oldTask.version) {
      const fullTask = await this.getTask(taskId);
      throw new ConflictException({
        message: 'Task was modified by another user',
        task: fullTask
      });
    }

    if (data.status !== undefined && data.status !== oldTask.status) {
      let canBypass = false;
      const projectMember = await this.prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } }
      });
      let projectForTransitions: any = null;
      if (projectMember && (projectMember.role === Role.Admin || projectMember.role === Role.Owner)) {
        canBypass = true;
      } else {
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { workspaceId: true, transitionMode: true, customTransitions: true }
        });
        projectForTransitions = project;
        if (project) {
          const workspaceMember = await this.prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } }
          });
          if (workspaceMember && (workspaceMember.role === Role.Owner || workspaceMember.role === Role.Admin)) {
            canBypass = true;
          }
        }
      }

      if (!canBypass) {
        if (!projectForTransitions) {
          projectForTransitions = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { transitionMode: true, customTransitions: true }
          });
        }
        
        let allowedTransitions = ALLOWED_STATUS_TRANSITIONS as Record<string, string[]>;
        if (projectForTransitions && projectForTransitions.transitionMode === 'Custom' && projectForTransitions.customTransitions) {
          allowedTransitions = projectForTransitions.customTransitions as Record<string, string[]>;
        }

        const allowed = allowedTransitions[oldTask.status];
        if (!allowed || !allowed.includes(data.status)) {
          throw new BadRequestException(`Status transition from ${oldTask.status} to ${data.status} is not allowed.`);
        }
      }
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.startTime !== undefined && { startTime: data.startTime }),
        ...(data.endTime !== undefined && { endTime: data.endTime }),
        ...(data.label !== undefined && { label: data.label }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        version: { increment: 1 },
      },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true } }
      }
    });

    // Handle CalendarBlock updates on assignee change
    if (data.assigneeId !== undefined && data.assigneeId !== oldTask?.assigneeId) {
      await this.prisma.calendarBlock.deleteMany({ where: { taskId } });
      if (data.assigneeId && updated.startTime && updated.endTime) {
        await this.prisma.calendarBlock.create({
          data: {
            userId: data.assigneeId,
            taskId,
            startDatetime: updated.startTime,
            endDatetime: updated.endTime,
            label: updated.title,
          }
        });
      }
    }

    const delta: any = { id: taskId };
    for (const key of Object.keys(data)) {
      delta[key] = (updated as any)[key];
    }
    if (data.assigneeId !== undefined) {
      delta.assignee = updated.assignee;
    }

    if (data.status !== undefined && data.status !== oldTask?.status) {
      this.realtime.emitToProject(projectId, 'task:status_changed', { id: taskId, oldStatus: oldTask?.status, newStatus: updated.status }, socketId);
      
      if (updated.status === TaskStatus.Completed) {
        this.activity.logEvent({
          eventType: ActivityEventType.TaskCompleted,
          actorId: userId,
          projectId,
          taskId: updated.id,
        });
      } else {
        this.activity.logEvent({
          eventType: ActivityEventType.StatusChanged,
          actorId: userId,
          projectId,
          taskId: updated.id,
          metadata: { oldStatus: oldTask?.status, newStatus: updated.status }
        });
      }

      if (updated.assigneeId && updated.assigneeId !== userId) {
        const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
        await this.notificationService.dispatch({
          recipientId: updated.assigneeId,
          type: 'task_updated',
          message: `${actor?.fullName || 'Someone'} changed the status of your task "${updated.title}" to ${updated.status}.`,
          referenceId: updated.id,
        });
      }
    }
    this.realtime.emitToProject(projectId, 'task:updated', delta, socketId);
    this.activity.logEvent({
      eventType: ActivityEventType.TaskUpdated,
      actorId: userId,
      projectId,
      taskId: updated.id,
    });

    if (data.assigneeId && data.assigneeId !== oldTask?.assigneeId && data.assigneeId !== userId) {
      const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      await this.notificationService.dispatch({
        recipientId: data.assigneeId,
        type: 'task_assigned',
        message: `${actor?.fullName || 'Someone'} assigned you to task "${updated.title}".`,
        referenceId: updated.id,
      });
    }

    await this.clearDashboardCache(projectId);

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (project) {
      if (data.status !== undefined && data.status !== oldTask?.status) {
        await this.auditLogService.log({
          event: AuditEventType.TASK_STATUS_CHANGED,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'Task',
          resourceId: taskId,
          metadata: { projectId, taskName: oldTask.title, oldStatus: oldTask.status, newStatus: data.status }
        });
      }
      if (data.assigneeId !== undefined && data.assigneeId !== oldTask?.assigneeId) {
        let newAssigneeName = null;
        if (data.assigneeId) {
          const newA = await this.prisma.user.findUnique({ where: { id: data.assigneeId }, select: { fullName: true } });
          newAssigneeName = newA?.fullName;
        }
        await this.auditLogService.log({
          event: AuditEventType.TASK_ASSIGNEE_CHANGED,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'Task',
          resourceId: taskId,
          metadata: { projectId, taskName: oldTask.title, oldAssigneeName: oldTask.assignee?.fullName || null, newAssigneeName }
        });
      }
      if (data.description !== undefined && data.description !== oldTask?.description) {
        await this.auditLogService.log({
          event: AuditEventType.TASK_DESCRIPTION_CHANGED,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'Task',
          resourceId: taskId,
          metadata: { projectId, taskName: oldTask.title }
        });
      }
      const oldDueStr = oldTask?.dueDate ? new Date(oldTask.dueDate).toISOString() : null;
      const newDueStr = data.dueDate ? new Date(data.dueDate).toISOString() : null;
      if (data.dueDate !== undefined && oldDueStr !== newDueStr) {
        await this.auditLogService.log({
          event: AuditEventType.TASK_DUE_DATE_CHANGED,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'Task',
          resourceId: taskId,
          metadata: { projectId, taskName: oldTask.title, oldDueDate: oldTask?.dueDate, newDueDate: data.dueDate }
        });
      }
    }

    return { ...updated, previousStatus: oldTask?.status };
  }

  async reorderTask(projectId: string, taskId: string, data: { sortOrder: number; updates?: { id: string; sortOrder: number }[] }, socketId?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { sortOrder: data.sortOrder }
      });

      if (data.updates?.length) {
        for (const u of data.updates) {
          await tx.task.update({
            where: { id: u.id },
            data: { sortOrder: u.sortOrder }
          });
        }
      }
    });

    const payload = data.updates || [{ id: taskId, sortOrder: data.sortOrder }];
    this.realtime.emitToProject(projectId, 'task:reordered', payload, socketId);

    return { success: true };
  }

  async deleteTask(userId: string, projectId: string, taskId: string, socketId?: string) {
    // Only project Admin or above can delete
    const projectMember = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } }
    });

    let isAdmin = projectMember && (projectMember.role === Role.Admin || projectMember.role === Role.Owner);

    if (!isAdmin) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
      if (project) {
        const wsMember = await this.prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } }
        });
        if (wsMember && (wsMember.role === Role.Admin || wsMember.role === Role.Owner)) isAdmin = true;
      }
    }

    if (!isAdmin) throw new ForbiddenException('Only project Admins can delete tasks');

    // Delete MinIO attachments first
    const attachments = await this.prisma.attachment.findMany({ where: { taskId }, select: { storageKey: true } });
    for (const att of attachments) {
      try { await this.minioClient.removeObject(this.bucket, att.storageKey); } catch {}
    }

    await this.prisma.task.delete({ where: { id: taskId } });
    this.realtime.emitToProject(projectId, 'task:deleted', { id: taskId }, socketId);
    
    const proj = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (proj) {
      await this.auditLogService.log({
        event: AuditEventType.TASK_DELETED,
        workspaceId: proj.workspaceId,
        actorId: userId,
        resourceType: 'Task',
        resourceId: taskId,
        metadata: { projectId }
      });
    }

    await this.clearDashboardCache(projectId);
    
    return { success: true };
  }

  private async broadcastSubtaskCounts(projectId: string, taskId: string, socketId?: string) {
    const parentTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { checklistItems: { select: { isDone: true } } }
    });
    if (parentTask) {
      const count = parentTask.checklistItems.length;
      const completed = parentTask.checklistItems.filter(item => item.isDone).length;
      this.realtime.emitToProject(projectId, 'task:updated', { id: taskId, subTaskCount: count, completedSubTaskCount: completed }, socketId);
    }
  }

  // --- SubTask CRUD ---
  async createSubTask(userId: string, projectId: string, taskId: string, data: any, socketId?: string) {
    const subtask = await this.prisma.subTask.create({
      data: {
        title: data.title,
        assigneeId: data.assigneeId,
        dueDate: data.dueDate,
        parentTaskId: taskId,
      },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true } }
      }
    });
    this.realtime.emitToProject(projectId, 'subtask:updated', subtask, socketId);
    await this.broadcastSubtaskCounts(projectId, taskId, socketId);

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    const parentTask = await this.prisma.task.findUnique({ where: { id: taskId }, select: { title: true } });
    
    if (project && parentTask) {
      await this.auditLogService.log({
        event: AuditEventType.SUBTASK_CREATED,
        workspaceId: project.workspaceId,
        actorId: userId,
        resourceType: 'SubTask',
        resourceId: subtask.id,
        metadata: { projectId, subtaskTitle: subtask.title, parentTaskName: parentTask.title }
      });
      
      if (subtask.assigneeId) {
        await this.auditLogService.log({
          event: AuditEventType.SUBTASK_ASSIGNED,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'SubTask',
          resourceId: subtask.id,
          metadata: { projectId, subtaskTitle: subtask.title, assigneeName: subtask.assignee?.fullName || null }
        });
      }
    }

    return subtask;
  }

  async updateSubTask(userId: string, projectId: string, taskId: string, subtaskId: string, data: any, socketId?: string) {
    const oldSubtask = await this.prisma.subTask.findUnique({ where: { id: subtaskId }, select: { assigneeId: true, title: true } });
    const subtask = await this.prisma.subTask.update({
      where: { id: subtaskId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.isDone !== undefined && { isDone: data.isDone }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: {
        assignee: { select: { id: true, fullName: true, avatarUrl: true, email: true } }
      }
    });
    this.realtime.emitToProject(projectId, 'subtask:updated', subtask, socketId);
    if (data.isDone !== undefined) {
      await this.broadcastSubtaskCounts(projectId, taskId, socketId);
    }

    if (data.assigneeId !== undefined && data.assigneeId !== oldSubtask?.assigneeId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
      if (project) {
        await this.auditLogService.log({
          event: AuditEventType.SUBTASK_ASSIGNED,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'SubTask',
          resourceId: subtask.id,
          metadata: { projectId, subtaskTitle: subtask.title, assigneeName: subtask.assignee?.fullName || null }
        });
      }
    }

    return subtask;
  }

  async deleteSubTask(projectId: string, taskId: string, subtaskId: string, socketId?: string) {
    await this.prisma.subTask.delete({ where: { id: subtaskId } });
    this.realtime.emitToProject(projectId, 'subtask:deleted', { id: subtaskId, parentTaskId: taskId }, socketId);
    await this.broadcastSubtaskCounts(projectId, taskId, socketId);
    return { success: true };
  }

  // --- Comments ---
  async getComments(taskId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { taskId, parentCommentId: null },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        replies: {
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: 100
    });
    return comments;
  }

  async createComment(userId: string, projectId: string, taskId: string, data: any, socketId?: string) {
    const comment = await this.prisma.comment.create({
      data: {
        body: data.body,
        taskId,
        authorId: userId,
        parentCommentId: data.parentCommentId,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } }
      }
    });

    this.realtime.emitToProject(projectId, 'comment:added', comment, socketId);
    this.activity.logEvent({
      eventType: ActivityEventType.CommentAdded,
      actorId: userId,
      projectId,
      taskId,
    });

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { assigneeId: true, title: true }
    });

    if (task?.assigneeId && task.assigneeId !== userId) {
      await this.notificationService.dispatch({
        recipientId: task.assigneeId,
        type: 'comment_added',
        message: `${comment.author.fullName} commented on task "${task.title}".`,
        referenceId: taskId,
      });
    }

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (project && task) {
      await this.auditLogService.log({
        event: AuditEventType.COMMENT_ADDED,
        workspaceId: project.workspaceId,
        actorId: userId,
        resourceType: 'Task',
        resourceId: taskId,
        metadata: { projectId, taskName: task.title }
      });
    }

    return comment;
  }

  async deleteComment(userId: string, projectId: string, taskId: string, commentId: string, socketId?: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true }
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const isAuthor = comment.authorId === userId;
    const projectMember = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } }
    });
    const isAdmin = projectMember && (projectMember.role === Role.Admin || projectMember.role === Role.Owner);

    if (!isAuthor && !isAdmin) throw new ForbiddenException('Not allowed to delete this comment');

    await this.prisma.comment.delete({ where: { id: commentId } });
    this.realtime.emitToProject(projectId, 'comment:deleted', { id: commentId, taskId }, socketId);

    if (!isAuthor && isAdmin) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
      if (project) {
        const originalAuthor = await this.prisma.user.findUnique({ where: { id: comment.authorId }, select: { fullName: true } });
        const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { title: true } });
        await this.auditLogService.log({
          event: AuditEventType.COMMENT_DELETED_BY_ADMIN,
          workspaceId: project.workspaceId,
          actorId: userId,
          resourceType: 'Task',
          resourceId: taskId,
          metadata: { projectId, taskName: task?.title, originalAuthorName: originalAuthor?.fullName }
        });
      }
    }

    return { success: true };
  }

  // --- Attachments ---
  async getAttachments(taskId: string) {
    const attachments = await this.prisma.attachment.findMany({
      where: { taskId },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' },
      take: 100
    });

    return Promise.all(attachments.map(async (att) => {
      let url = '';
      let downloadUrl = '';
      try {
        url = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60);
        downloadUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
          'response-content-disposition': `attachment; filename="${encodeURIComponent(att.fileName)}"`
        });
      } catch {}
      return { ...att, url, downloadUrl };
    }));
  }

  async uploadAttachment(
    userId: string,
    taskId: string,
    workspaceSlug: string,
    projectId: string,
    file: Express.Multer.File,
    socketId?: string
  ) {
    const storageKey = `${workspaceSlug}/${projectId}/${taskId}/${Date.now()}-${file.originalname}`;

    // Ensure bucket exists
    const bucketExists = await this.minioClient.bucketExists(this.bucket);
    if (!bucketExists) {
      await this.minioClient.makeBucket(this.bucket, 'us-east-1');
    }

    await this.minioClient.putObject(this.bucket, storageKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: file.originalname,
        storageKey,
        fileSize: file.size,
        mimeType: file.mimetype,
        taskId,
        uploaderId: userId,
      },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } }
      }
    });

    let url = '';
    let downloadUrl = '';
    try {
      url = await this.minioClient.presignedGetObject(this.bucket, storageKey, 60 * 60);
      downloadUrl = await this.minioClient.presignedGetObject(this.bucket, storageKey, 60 * 60, {
        'response-content-disposition': `attachment; filename="${encodeURIComponent(file.originalname)}"`
      });
    } catch {}

    const result = { ...attachment, url, downloadUrl };
    this.realtime.emitToProject(projectId, 'attachment:added', result, socketId);
    this.activity.logEvent({
      eventType: ActivityEventType.AttachmentAdded,
      actorId: userId,
      projectId,
      taskId,
      metadata: { fileName: file.originalname }
    });

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    const taskObj = await this.prisma.task.findUnique({ where: { id: taskId }, select: { title: true } });
    if (project && taskObj) {
      await this.auditLogService.log({
        event: AuditEventType.ATTACHMENT_UPLOADED,
        workspaceId: project.workspaceId,
        actorId: userId,
        resourceType: 'Task',
        resourceId: taskId,
        metadata: { projectId, taskName: taskObj.title, fileName: file.originalname }
      });
    }

    return result;
  }

  async deleteAttachment(userId: string, projectId: string, taskId: string, attachmentId: string, socketId?: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { uploaderId: true, storageKey: true, fileName: true }
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    const isUploader = attachment.uploaderId === userId;
    const projectMember = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } }
    });
    const isAdmin = projectMember && (projectMember.role === Role.Admin || projectMember.role === Role.Owner);

    if (!isUploader && !isAdmin) throw new ForbiddenException('Not allowed to delete this attachment');

    try { await this.minioClient.removeObject(this.bucket, attachment.storageKey); } catch {}
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    this.realtime.emitToProject(projectId, 'attachment:deleted', { id: attachmentId, taskId }, socketId);

    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    const taskObj = await this.prisma.task.findUnique({ where: { id: taskId }, select: { title: true } });
    if (project && taskObj) {
      await this.auditLogService.log({
        event: AuditEventType.ATTACHMENT_DELETED,
        workspaceId: project.workspaceId,
        actorId: userId,
        resourceType: 'Task',
        resourceId: taskId,
        metadata: { projectId, taskName: taskObj.title, fileName: attachment.fileName }
      });
    }

    return { success: true };
  }
}
