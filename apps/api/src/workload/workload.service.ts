import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkloadService {
  constructor(private prisma: PrismaService) {}

  private getWorkloadLevel(taskCount: number) {
    if (taskCount < 8) return 'Low';
    if (taskCount < 12) return 'Medium';
    return 'High';
  }

  private getAvatarInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  async getProjectWorkload(requesterId: string, slug: string, projectId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const requesterMember = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: workspace.id } }
    });
    if (!requesterMember) throw new ForbiddenException('Not a member of workspace');

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, user: { projectMembers: { some: { projectId } } } },
      include: {
        user: {
          include: {
            assignedTasks: { where: { projectId } },
            calendarBlocks: true,
            projectMembers: { 
              where: { project: { workspaceId: workspace.id } },
              include: { project: true }
            }
          }
        }
      }
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const results = members.map((m: any) => {
      const tasks = m.user.assignedTasks;
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t: any) => t.status === 'Completed').length;
      
      const blocks = m.user.calendarBlocks;
      const projectBlocks = blocks.filter((b: any) => b.taskId && tasks.find((t: any) => t.id === b.taskId));
      const slotsBooked = projectBlocks.length;

      const weekBlocks = blocks.filter((b: any) => b.startDatetime >= startOfWeek && b.endDatetime < endOfWeek);
      const totalHours = weekBlocks.reduce((sum: number, b: any) => {
        return sum + (b.endDatetime.getTime() - b.startDatetime.getTime()) / (1000 * 60 * 60);
      }, 0);

      const projects = m.user.projectMembers.map((pm: any) => pm.project.name);

      const adminShape = {
        userId: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        avatarInitials: this.getAvatarInitials(m.user.fullName),
        role: m.role,
        status: m.onLeave ? 'OnLeave' : 'Active',
        lastSeenAt: m.user.lastSeenAt,
        tasksAssigned: totalTasks,
        completedTasks,
        timeSlotsBooked: slotsBooked,
        hoursThisWeek: Math.round(totalHours * 10) / 10,
        projects,
        workloadLevel: this.getWorkloadLevel(totalTasks)
      };

      const memberShape = {
        userId: m.user.id,
        fullName: m.user.fullName,
        avatarInitials: this.getAvatarInitials(m.user.fullName),
        role: m.role,
        status: m.onLeave ? 'OnLeave' : 'Active',
        lastSeenAt: m.user.lastSeenAt,
        tasksAssigned: totalTasks,
        timeSlotsBooked: slotsBooked,
      };

      return { admin: adminShape, member: memberShape };
    });

    return results.sort((a, b) => b.admin.tasksAssigned - a.admin.tasksAssigned);
  }

  async getWorkspaceWorkload(requesterId: string, slug: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const requesterMember = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: workspace.id } }
    });
    if (!requesterMember) throw new ForbiddenException('Not a member of workspace');

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: {
          include: {
            assignedTasks: { where: { project: { workspaceId: workspace.id } } },
            calendarBlocks: true,
            projectMembers: { 
              where: { project: { workspaceId: workspace.id } },
              include: { project: true }
            }
          }
        }
      }
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const results = members.map((m: any) => {
      const tasks = m.user.assignedTasks;
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t: any) => t.status === 'Completed').length;
      
      const blocks = m.user.calendarBlocks;
      const workspaceBlocks = blocks.filter((b: any) => b.taskId && tasks.find((t: any) => t.id === b.taskId));
      const slotsBooked = workspaceBlocks.length;

      const weekBlocks = blocks.filter((b: any) => b.startDatetime >= startOfWeek && b.endDatetime < endOfWeek);
      const totalHours = weekBlocks.reduce((sum: number, b: any) => {
        return sum + (b.endDatetime.getTime() - b.startDatetime.getTime()) / (1000 * 60 * 60);
      }, 0);

      const projects = m.user.projectMembers.map((pm: any) => {
        const pTasks = tasks.filter((t: any) => t.projectId === pm.projectId).length;
        return { name: pm.project.name, count: pTasks };
      });

      const adminShape = {
        userId: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        avatarInitials: this.getAvatarInitials(m.user.fullName),
        role: m.role,
        status: m.onLeave ? 'OnLeave' : 'Active',
        lastSeenAt: m.user.lastSeenAt,
        tasksAssigned: totalTasks,
        completedTasks,
        timeSlotsBooked: slotsBooked,
        hoursThisWeek: Math.round(totalHours * 10) / 10,
        projects,
        workloadLevel: this.getWorkloadLevel(totalTasks)
      };

      const memberShape = {
        userId: m.user.id,
        fullName: m.user.fullName,
        avatarInitials: this.getAvatarInitials(m.user.fullName),
        role: m.role,
        status: m.onLeave ? 'OnLeave' : 'Active',
        lastSeenAt: m.user.lastSeenAt,
        tasksAssigned: totalTasks,
        timeSlotsBooked: slotsBooked,
      };

      return { admin: adminShape, member: memberShape };
    });

    return results.sort((a, b) => b.admin.tasksAssigned - a.admin.tasksAssigned);
  }

  async toggleLeaveStatus(requesterId: string, slug: string, targetUserId: string, onLeave: boolean) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const requesterMember = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId: workspace.id } }
    });
    if (!requesterMember || (requesterMember.role !== 'Owner' && requesterMember.role !== 'Admin')) {
      throw new ForbiddenException('Only Owners and Admins can toggle leave status');
    }

    const member = await this.prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId: workspace.id } },
      data: { onLeave }
    });

    return member;
  }
}
