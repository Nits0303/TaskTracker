import { Controller, Get, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceRoleGuard, RequireRole } from '../workspace/guards/workspace-role.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceRoleGuard)
@Controller('workspaces/:slug/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: 'Get workspace audit logs' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'event', required: false, description: 'Filter by event type' })
  @ApiQuery({ name: 'actorId', required: false, description: 'Filter by actor ID' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (ISO)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (ISO)' })
  @ApiResponse({ status: 200, description: 'List of audit logs.' })
  @RequireRole('Admin')
  @Get()
  async getAuditLogs(
    @Param('slug') slug: string,
    @Query('page') pageStr: string,
    @Query('limit') limitStr: string,
    @Query('event') event: string,
    @Query('actorId') actorId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!workspace) {
      throw new HttpException({ message: 'Workspace not found' }, HttpStatus.NOT_FOUND);
    }

    const page = Math.max(1, parseInt(pageStr || '1', 10));
    let limit = Math.min(50, Math.max(1, parseInt(limitStr || '20', 10)));
    
    const where: any = { workspaceId: workspace.id };

    const workspaceEvents = [
      'LOGIN_SUCCESS', 'LOGOUT', 'BRUTE_FORCE_DETECTED',
      'RATE_LIMIT_VIOLATION',
      'WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'WORKSPACE_ARCHIVED', 'WORKSPACE_DELETED',
      'WORKSPACE_SETTINGS_CHANGED',
      'WORKSPACE_MEMBER_INVITED', 'WORKSPACE_MEMBER_REMOVED', 'WORKSPACE_MEMBER_ROLE_CHANGED',
      'PROJECT_CREATED', 'PROJECT_ARCHIVED', 'PROJECT_DELETED',
      'PROJECT_MEMBER_ADDED', 'PROJECT_MEMBER_REMOVED'
    ];

    if (event) {
      const events = event.split(',').filter(e => workspaceEvents.includes(e));
      if (events.length > 0) {
        where.event = { in: events };
      } else {
        where.event = { in: workspaceEvents };
      }
    } else {
      where.event = { in: workspaceEvents };
    }

    if (actorId) {
      where.actorId = actorId;
    }

    // Default to last 7 days if no dates provided, max 90 days
    const now = new Date();
    const maxDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    let fromDate = from ? new Date(from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    let toDate = to ? new Date(to) : now;

    if (fromDate < maxDate) {
      fromDate = maxDate;
    }

    where.createdAt = {
      gte: fromDate,
      lte: toDate,
    };

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: {
            select: { id: true, fullName: true, email: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
