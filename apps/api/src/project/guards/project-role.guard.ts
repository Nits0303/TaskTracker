import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_PROJECT_ROLE_KEY } from '../decorators/require-project-role.decorator';
import { Role } from '@prisma/client';

const RoleHierarchy: Record<Role, number> = {
  [Role.Viewer]: 1,
  [Role.Member]: 2,
  [Role.Admin]: 3,
  [Role.Owner]: 4,
};

@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<Role>(REQUIRE_PROJECT_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId = request.params.projectId;

    if (!user || !projectId) {
      return false;
    }

    const projectMember = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: user.userId,
          projectId: projectId,
        },
      },
      include: {
        project: true
      }
    });

    if (projectMember) {
      const userLevel = RoleHierarchy[projectMember.role];
      const requiredLevel = RoleHierarchy[requiredRole];
      if (userLevel >= requiredLevel) {
        return true;
      }
    }

    // Check if they are a Workspace Admin/Owner
    let workspaceId = projectMember?.project?.workspaceId;
    let isPublic = projectMember?.project?.isPublic;
    if (!workspaceId || isPublic === undefined) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true, isPublic: true }
      });
      if (!project) throw new NotFoundException('Project not found');
      workspaceId = project.workspaceId;
      isPublic = project.isPublic;
    }

    if (isPublic && requiredRole === Role.Viewer) {
      return true;
    }

    const workspaceMember = await this.prisma.workspaceMember.findUnique({
      where: {
         userId_workspaceId: {
            userId: user.userId,
            workspaceId: workspaceId,
         }
      }
    });

    if (workspaceMember && workspaceMember.role === Role.Owner) {
       return true;
    }

    throw new ForbiddenException(`Requires Project ${requiredRole} or Workspace Admin role.`);
  }
}
