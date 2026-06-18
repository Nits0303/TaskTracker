import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityEventType, Role } from '@prisma/client';

@Controller('workspaces/:slug')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  private async buildActivityResponse(where: any, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          task: { select: { title: true } },
          project: { select: { name: true } }
        }
      }),
      this.prisma.activityEvent.count({ where })
    ]);

    const actorIds = [...new Set(events.map(e => e.actorId))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true, avatarUrl: true }
    });
    const actorMap = new Map(actors.map(a => [a.id, a]));

    const mappedEvents = events.map(e => {
      const actor = actorMap.get(e.actorId);
      return {
        ...e,
        actorName: actor?.fullName || 'Unknown User',
        actorAvatarUrl: actor?.avatarUrl || null,
      };
    });

    return { events: mappedEvents, total };
  }

  private buildFilters(type?: string, userId?: string, from?: string, to?: string) {
    const filters: any = {};
    if (type) {
      filters.eventType = { in: type.split(',') as ActivityEventType[] };
    }
    if (userId) {
      filters.actorId = userId;
    }
    if (from || to) {
      filters.createdAt = {};
      if (from) filters.createdAt.gte = new Date(from);
      if (to) filters.createdAt.lte = new Date(to);
    }
    return filters;
  }

  @Get('projects/:projectId/activity')
  async getProjectActivity(
    @Param('projectId') projectId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '6',
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const where = {
      projectId,
      ...this.buildFilters(type, userId, from, to)
    };

    return this.buildActivityResponse(where, pageNum, limitNum);
  }

  @Get('activity')
  async getWorkspaceActivity(
    @Req() req: any,
    @Param('slug') slug: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '6',
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userIdendity = req.user.userId;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      include: { members: { where: { userId: userIdendity } } }
    });
    
    if (!workspace) {
      return { events: [], total: 0 };
    }

    const member = workspace.members[0];
    const isWorkspaceAdmin = member?.role === Role.Owner || member?.role === Role.Admin;

    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId: workspace.id,
        ...(isWorkspaceAdmin ? {} : { members: { some: { userId: userIdendity } } })
      },
      select: { id: true }
    });
    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
      return { events: [], total: 0 };
    }

    const where = {
      projectId: { in: projectIds },
      ...this.buildFilters(type, userId, from, to)
    };

    return this.buildActivityResponse(where, pageNum, limitNum);
  }
}
