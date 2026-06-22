import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, ActivityEventType, AuditEventType } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AuditLogService } from '../audit/audit.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async createProject(userId: string, slug: string, data: any, ipAddress?: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      include: { members: { where: { userId } } }
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const member = workspace.members[0];
    if (!member || (member.role !== Role.Owner && member.role !== Role.Admin)) {
      throw new ForbiddenException('Only Workspace Owner or Admin can create projects');
    }

    const project = await this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        workspaceId: workspace.id,
        members: {
          create: {
            userId,
            role: Role.Admin
          }
        }
      }
    });

    await this.auditLogService.log({
      event: AuditEventType.PROJECT_CREATED,
      workspaceId: workspace.id,
      actorId: userId,
      ipAddress,
      resourceType: 'Project',
      resourceId: project.id,
      resourceName: project.name,
    });

    return project;
  }

  async getProjects(userId: string, slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      include: { members: { where: { userId } } }
    });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const member = workspace.members[0];
    if (!member) throw new ForbiddenException('Not a workspace member');

    const isWorkspaceOwner = member.role === Role.Owner;

    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId: workspace.id,
        ...(isWorkspaceOwner ? {} : { OR: [{ isPublic: true }, { members: { some: { userId } } }] })
      },
      include: {
        members: {
          where: { userId }
        },
        _count: {
          select: { members: true, tasks: true }
        },
        tasks: {
          select: { status: true }
        }
      },
      take: 100
    });

    return projects.map(p => {
      const todo = p.tasks.filter(t => t.status === 'Todo').length;
      const inProgress = p.tasks.filter(t => t.status === 'InProgress').length;
      const review = p.tasks.filter(t => t.status === 'Review').length;
      const completed = p.tasks.filter(t => t.status === 'Completed').length;
      
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        isArchived: p.isArchived,
        isPublic: p.isPublic,
        realtimeUpdates: p.realtimeUpdates,
        transitionMode: p.transitionMode,
        customTransitions: p.customTransitions,
        createdAt: p.createdAt,
        userRole: p.members[0]?.role || (isWorkspaceOwner ? member.role : null),
        memberCount: p._count.members,
        taskCounts: {
          total: p._count.tasks,
          todo,
          inProgress,
          review,
          completed
        }
      };
    });
  }

  async getProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, fullName: true, avatarUrl: true } }
          }
        },
        tasks: { select: { status: true } }
      }
    });

    if (!project) throw new NotFoundException('Project not found');

    const todo = project.tasks.filter(t => t.status === 'Todo').length;
    const inProgress = project.tasks.filter(t => t.status === 'InProgress').length;
    const review = project.tasks.filter(t => t.status === 'Review').length;
    const completed = project.tasks.filter(t => t.status === 'Completed').length;

    const userMembership = project.members.find(m => m.userId === userId);

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      isArchived: project.isArchived,
      isPublic: project.isPublic,
      realtimeUpdates: project.realtimeUpdates,
      transitionMode: project.transitionMode,
      customTransitions: project.customTransitions,
      createdAt: project.createdAt,
      userRole: userMembership?.role,
      memberCount: project.members.length,
      taskCounts: {
        total: project.tasks.length,
        todo,
        inProgress,
        review,
        completed
      },
      members: project.members.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user
      }))
    };
  }

  async updateProject(projectId: string, data: any, actorId?: string, ipAddress?: string) {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: data.name,
        description: data.description,
        status: data.status,
        isPublic: data.isPublic,
        realtimeUpdates: data.realtimeUpdates,
        ...(data.transitionMode !== undefined && { transitionMode: data.transitionMode }),
        ...(data.customTransitions !== undefined && { customTransitions: data.customTransitions || null })
      }
    });

    if (actorId) {
      await this.auditLogService.log({
        event: AuditEventType.PROJECT_SETTINGS_CHANGED,
        workspaceId: project.workspaceId,
        actorId,
        ipAddress,
        resourceType: 'Project',
        resourceId: project.id,
        resourceName: project.name,
      });
    }

    return project;
  }

  async archiveProject(projectId: string, actorId?: string, ipAddress?: string) {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true }
    });

    if (actorId) {
      await this.auditLogService.log({
        event: AuditEventType.PROJECT_ARCHIVED,
        workspaceId: project.workspaceId,
        actorId,
        ipAddress,
        resourceType: 'Project',
        resourceId: project.id,
        resourceName: project.name,
      });
    }

    return project;
  }

  async deleteProject(projectId: string, confirmationName: string, actorId?: string, ipAddress?: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.name !== confirmationName) {
      throw new ForbiddenException('Project name confirmation does not match');
    }

    if (actorId) {
      await this.auditLogService.log({
        event: AuditEventType.PROJECT_DELETED,
        workspaceId: project.workspaceId,
        actorId,
        ipAddress,
        resourceType: 'Project',
        resourceId: project.id,
        resourceName: project.name,
      });
    }

    return this.prisma.project.delete({
      where: { id: projectId }
    });
  }

  async getMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          }
        }
      }
    });
  }

  async addMember(projectId: string, targetUserId: string, role: Role, actorId?: string, ipAddress?: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // Check if user is in workspace
    const workspaceMember = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: project.workspaceId } }
    });
    if (!workspaceMember) throw new ForbiddenException('User must be a member of the workspace first');

    const existing = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: targetUserId, projectId } }
    });
    if (existing) throw new ForbiddenException('User is already a member of this project');

    await this.prisma.projectMember.create({
      data: {
        userId: targetUserId,
        projectId,
        role
      }
    });

    this.activity.logEvent({
      eventType: ActivityEventType.MemberJoined,
      actorId: targetUserId,
      projectId,
    });

    if (actorId) {
      const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { fullName: true } });
      await this.auditLogService.log({
        event: AuditEventType.PROJECT_MEMBER_ADDED,
        workspaceId: project.workspaceId,
        actorId,
        ipAddress,
        resourceType: 'User',
        resourceId: targetUserId,
        metadata: { role, projectId, projectName: project.name, memberName: targetUser?.fullName }
      });
    }

    return { success: true };
  }

  async updateMemberRole(projectId: string, targetUserId: string, role: Role, actorId?: string, ipAddress?: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: targetUserId, projectId } }
    });
    if (!member) throw new NotFoundException('Project member not found');

    await this.prisma.projectMember.update({
      where: { id: member.id },
      data: { role }
    });

    if (actorId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { fullName: true } });
      if (project) {
        await this.auditLogService.log({
          event: AuditEventType.PROJECT_MEMBER_ROLE_CHANGED,
          workspaceId: project.workspaceId,
          actorId,
          ipAddress,
          resourceType: 'ProjectMember',
          resourceId: member.id,
          metadata: { targetUserId, oldRole: member.role, newRole: role, projectId, projectName: project.name, memberName: targetUser?.fullName }
        });
      }
    }

    return { success: true };
  }

  async removeMember(projectId: string, targetUserId: string, actorId?: string, ipAddress?: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: targetUserId, projectId } }
    });
    if (!member) throw new NotFoundException('Project member not found');

    await this.prisma.projectMember.delete({ where: { id: member.id } });

    this.activity.logEvent({
      eventType: ActivityEventType.MemberRemoved,
      actorId: targetUserId,
      projectId,
    });

    if (actorId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (project) {
        await this.auditLogService.log({
          event: AuditEventType.PROJECT_MEMBER_REMOVED,
          workspaceId: project.workspaceId,
          actorId,
          ipAddress,
          resourceType: 'User',
          resourceId: targetUserId,
          metadata: { projectId }
        });
      }
    }

    return { success: true };
  }
}
