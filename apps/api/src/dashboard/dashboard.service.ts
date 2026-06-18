import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../realtime/redis.module';
import { Redis } from 'ioredis';
import { TaskStatus, ActivityEventType, Role } from '@prisma/client';

/**
 * Redis Cache Keys:
 * - `dashboard:project:${projectId}:${userId}`: TTL 60s
 * - `dashboard:workspace:${slug}:${userId}`: TTL 60s
 */


@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private getDates(days: number) {
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }

  async getProjectDashboard(projectId: string, userId: string) {
    const cacheKey = `dashboard:project:${projectId}:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(now.getDate() - 14);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const startOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Check project access
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } }
    });
    if (!membership) {
      const workspaceMember = await this.prisma.workspaceMember.findFirst({
        where: { workspace: { projects: { some: { id: projectId } } }, userId, role: { in: [Role.Owner, Role.Admin] } }
      });
      if (!workspaceMember) throw new NotFoundException('Project not found or access denied');
    }

    const [
      totalTasks, completedTasks, inProgressTasks, overdueTasks,
      myAssigned, myCompleted, myInReview, myOverdue,
      statusGroup, memberTaskGroup, overdueList, trendEvents, myActivityEvents,
      projectMembers
    ] = await this.prisma.$transaction([
      this.prisma.task.count({ where: { projectId } }),
      this.prisma.task.count({ where: { projectId, status: 'Completed' } }),
      this.prisma.task.count({ where: { projectId, status: 'InProgress' } }),
      this.prisma.task.count({ where: { projectId, dueDate: { lt: startOfTodayUTC }, status: { not: 'Completed' } } }),
      
      this.prisma.task.count({ where: { projectId, assigneeId: userId } }),
      this.prisma.task.count({ where: { projectId, assigneeId: userId, status: 'Completed' } }),
      this.prisma.task.count({ where: { projectId, assigneeId: userId, status: 'Review' } }),
      this.prisma.task.count({ where: { projectId, assigneeId: userId, dueDate: { lt: startOfTodayUTC }, status: { not: 'Completed' } } }),

      this.prisma.task.groupBy({ by: ['status'], where: { projectId }, _count: { id: true }, orderBy: { status: 'asc' } }),
      this.prisma.task.groupBy({ by: ['assigneeId', 'status'], where: { projectId, assigneeId: { not: null } }, _count: { id: true }, orderBy: { assigneeId: 'asc' } }),
      
      this.prisma.task.findMany({
        where: { projectId, dueDate: { lt: startOfTodayUTC }, status: { not: 'Completed' } },
        orderBy: { dueDate: 'asc' }, take: 8,
        select: { id: true, title: true, dueDate: true, assignee: { select: { fullName: true } } }
      }),

      this.prisma.activityEvent.findMany({
        where: { projectId, eventType: 'TaskCompleted', createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true }
      }),

      this.prisma.activityEvent.findMany({
        where: { projectId, actorId: userId, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true }
      }),

      this.prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } }
      })
    ]);

    // Format admin.statusDistribution
    const statuses: TaskStatus[] = ['Todo', 'InProgress', 'Review', 'Completed'];
    const statusDistribution = statuses.map(st => {
      const g = statusGroup.find(sg => sg.status === st);
      const count = g ? ((g._count as any)?.id || 0) : 0;
      return {
        name: st,
        count,
        percentage: totalTasks === 0 ? 0 : Math.round((count / totalTasks) * 100)
      };
    });

    // Format admin.members
    const membersData = projectMembers.map(pm => {
      const mTasks = memberTaskGroup.filter(g => g.assigneeId === pm.user.id);
      const total = mTasks.reduce((sum, g) => sum + ((g as any)?._count?.id || 0), 0);
      const completed = mTasks.find(g => g.status === 'Completed') ? ((mTasks.find(g => g.status === 'Completed') as any)?._count?.id || 0) : 0;
      return {
        id: pm.user.id,
        name: pm.user.fullName,
        avatarInitials: pm.user.fullName.substring(0, 2).toUpperCase(),
        avatarUrl: pm.user.avatarUrl,
        totalTasks: total,
        completedTasks: completed
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks);

    // Format admin.overdueList
    const formattedOverdue = overdueList.map(t => {
      const diffTime = Math.abs(now.getTime() - t.dueDate!.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        id: t.id,
        title: t.title,
        assigneeName: t.assignee?.fullName || 'Unassigned',
        assigneeInitials: t.assignee ? t.assignee.fullName.substring(0, 2).toUpperCase() : '??',
        daysOverdue: diffDays
      };
    });

    // Format admin.completionTrend (14 days)
    const last14Dates = this.getDates(14);
    const completionTrend = last14Dates.map(dateStr => {
      const count = trendEvents.filter(e => e.createdAt.toISOString().startsWith(dateStr)).length;
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count
      };
    });

    // Format member.activityThisWeek (7 days)
    const last7Dates = this.getDates(7);
    const activityThisWeek = last7Dates.map(dateStr => {
      const count = myActivityEvents.filter(e => e.createdAt.toISOString().startsWith(dateStr)).length;
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count
      };
    });

    const response = {
      admin: {
        counts: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, overdue: overdueTasks },
        members: membersData,
        statusDistribution,
        overdueList: formattedOverdue,
        completionTrend
      },
      member: {
        counts: { assigned: myAssigned, completed: myCompleted, inReview: myInReview, overdue: myOverdue },
        activityThisWeek
      }
    };

    await this.redis.set(cacheKey, JSON.stringify(response), 'EX', 60);
    return response;
  }

  async getWorkspaceDashboard(slug: string, userId: string) {
    const cacheKey = `dashboard:workspace:${slug}:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      include: { members: { where: { userId } } }
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const isWorkspaceAdmin = workspace.members[0]?.role === Role.Owner || workspace.members[0]?.role === Role.Admin;
    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId: workspace.id,
        ...(isWorkspaceAdmin ? {} : { members: { some: { userId } } })
      },
      select: { id: true, name: true }
    });

    const projectIds = projects.map(p => p.id);
    if (projectIds.length === 0) {
      const empty = {
        admin: { counts: { total: 0, completed: 0, inProgress: 0, overdue: 0 }, members: [], statusDistribution: [], overdueList: [], completionTrend: [], projectBreakdown: [] },
        member: { counts: { assigned: 0, completed: 0, inReview: 0, overdue: 0 }, activityThisWeek: [] }
      };
      return empty;
    }

    const now = new Date();
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(now.getDate() - 14);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const startOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [
      totalTasks, completedTasks, inProgressTasks, overdueTasks,
      myAssigned, myCompleted, myInReview, myOverdue,
      statusGroup, memberTaskGroup, overdueList, trendEvents, myActivityEvents,
      projectMembers, projectTaskGroup
    ] = await this.prisma.$transaction([
      this.prisma.task.count({ where: { projectId: { in: projectIds } } }),
      this.prisma.task.count({ where: { projectId: { in: projectIds }, status: 'Completed' } }),
      this.prisma.task.count({ where: { projectId: { in: projectIds }, status: 'InProgress' } }),
      this.prisma.task.count({ where: { projectId: { in: projectIds }, dueDate: { lt: startOfTodayUTC }, status: { not: 'Completed' } } }),
      
      this.prisma.task.count({ where: { projectId: { in: projectIds }, assigneeId: userId } }),
      this.prisma.task.count({ where: { projectId: { in: projectIds }, assigneeId: userId, status: 'Completed' } }),
      this.prisma.task.count({ where: { projectId: { in: projectIds }, assigneeId: userId, status: 'Review' } }),
      this.prisma.task.count({ where: { projectId: { in: projectIds }, assigneeId: userId, dueDate: { lt: startOfTodayUTC }, status: { not: 'Completed' } } }),

      this.prisma.task.groupBy({ by: ['status'], where: { projectId: { in: projectIds } }, _count: { id: true }, orderBy: { status: 'asc' } }),
      this.prisma.task.groupBy({ by: ['assigneeId', 'status'], where: { projectId: { in: projectIds }, assigneeId: { not: null } }, _count: { id: true }, orderBy: { assigneeId: 'asc' } }),
      
      this.prisma.task.findMany({
        where: { projectId: { in: projectIds }, dueDate: { lt: startOfTodayUTC }, status: { not: 'Completed' } },
        orderBy: { dueDate: 'asc' }, take: 8,
        select: { id: true, title: true, dueDate: true, assignee: { select: { fullName: true } } }
      }),

      this.prisma.activityEvent.findMany({
        where: { projectId: { in: projectIds }, eventType: 'TaskCompleted', createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true }
      }),

      this.prisma.activityEvent.findMany({
        where: { projectId: { in: projectIds }, actorId: userId, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true }
      }),

      this.prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } }
      }),

      this.prisma.task.groupBy({ by: ['projectId', 'status'], where: { projectId: { in: projectIds } }, _count: { id: true }, orderBy: { projectId: 'asc' } }),
    ]);

    const statuses: TaskStatus[] = ['Todo', 'InProgress', 'Review', 'Completed'];
    const statusDistribution = statuses.map(st => {
      const g = statusGroup.find(sg => sg.status === st);
      const count = g ? ((g._count as any)?.id || 0) : 0;
      return {
        name: st,
        count,
        percentage: totalTasks === 0 ? 0 : Math.round((count / totalTasks) * 100)
      };
    });

    // Deduplicate members across projects
    const uniqueMembers = new Map();
    projectMembers.forEach(pm => uniqueMembers.set(pm.user.id, pm.user));

    const membersData = Array.from(uniqueMembers.values()).map(user => {
      const mTasks = memberTaskGroup.filter(g => g.assigneeId === user.id);
      const total = mTasks.reduce((sum, g) => sum + ((g as any)?._count?.id || 0), 0);
      const completed = mTasks.find(g => g.status === 'Completed') ? ((mTasks.find(g => g.status === 'Completed') as any)?._count?.id || 0) : 0;
      return {
        id: user.id,
        name: user.fullName,
        avatarInitials: user.fullName.substring(0, 2).toUpperCase(),
        avatarUrl: user.avatarUrl,
        totalTasks: total,
        completedTasks: completed
      };
    }).sort((a, b) => b.totalTasks - a.totalTasks);

    const formattedOverdue = overdueList.map(t => {
      const diffTime = Math.abs(now.getTime() - t.dueDate!.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return {
        id: t.id,
        title: t.title,
        assigneeName: t.assignee?.fullName || 'Unassigned',
        assigneeInitials: t.assignee ? t.assignee.fullName.substring(0, 2).toUpperCase() : '??',
        daysOverdue: diffDays
      };
    });

    const last14Dates = this.getDates(14);
    const completionTrend = last14Dates.map(dateStr => {
      const count = trendEvents.filter(e => e.createdAt.toISOString().startsWith(dateStr)).length;
      const d = new Date(dateStr);
      return {
        date: `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`,
        count
      };
    });

    const last7Dates = this.getDates(7);
    const activityThisWeek = last7Dates.map(dateStr => {
      const count = myActivityEvents.filter(e => e.createdAt.toISOString().startsWith(dateStr)).length;
      const d = new Date(dateStr);
      return {
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count
      };
    });

    // projectBreakdown
    const projectBreakdown = projects.map(p => {
      const pTasks = projectTaskGroup.filter(g => g.projectId === p.id);
      const total = pTasks.reduce((sum, g) => sum + ((g as any)?._count?.id || 0), 0);
      const completed = pTasks.find(g => g.status === 'Completed') ? ((pTasks.find(g => g.status === 'Completed') as any)?._count?.id || 0) : 0;
      // Overdue is trickier because we need dueDate < now in a groupBy, which isn't possible directly.
      // We will count them asynchronously below, or we could just skip overdue count or fetch it differently.
      return {
        id: p.id,
        name: p.name,
        totalTasks: total,
        completedTasks: completed,
        overdueTasks: 0 // placeholder
      };
    });

    // Populate overdue counts per project
    const overdueCounts = await this.prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, dueDate: { lt: now }, status: { not: 'Completed' } },
      _count: { id: true },
      orderBy: { projectId: 'asc' }
    });
    
    projectBreakdown.forEach(p => {
      const g = overdueCounts.find(o => o.projectId === p.id);
      if (g) p.overdueTasks = g?._count?.id || 0;
    });

    const response = {
      admin: {
        counts: { total: totalTasks, completed: completedTasks, inProgress: inProgressTasks, overdue: overdueTasks },
        members: membersData,
        statusDistribution,
        overdueList: formattedOverdue,
        completionTrend,
        projectBreakdown
      },
      member: {
        counts: { assigned: myAssigned, completed: myCompleted, inReview: myInReview, overdue: myOverdue },
        activityThisWeek
      }
    };

    await this.redis.set(cacheKey, JSON.stringify(response), 'EX', 60);
    return response;
  }
}
