import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

export const REQUIRE_ROLE_KEY = 'requireRole';
export const RequireRole = (role: Role) => SetMetadata(REQUIRE_ROLE_KEY, role);

const roleHierarchy: Record<Role, number> = {
  Viewer: 1,
  Member: 2,
  Admin: 3,
  Owner: 4,
};

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<Role>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const slug = request.params.slug;

    if (!user) return false;
    if (!slug) return true; // If no slug, this guard shouldn't block, rely on JwtAuthGuard

    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new ForbiddenException('Workspace not found');

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.userId, workspaceId: workspace.id } }
    });

    if (!membership) throw new ForbiddenException('You are not a member of this workspace');

    if (requiredRole) {
      const userRoleLevel = roleHierarchy[membership.role];
      const requiredRoleLevel = roleHierarchy[requiredRole];

      if (userRoleLevel < requiredRoleLevel) {
        throw new ForbiddenException(`Requires at least ${requiredRole} role`);
      }
    }

    // Attach workspace to request for convenience in controllers
    request.workspace = workspace;
    request.userRole = membership.role;

    return true;
  }
}
