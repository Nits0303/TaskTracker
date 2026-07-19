import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as Minio from 'minio';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit/audit.service';
import { AuditEventType } from '@prisma/client';

@Injectable()
export class WorkspaceService {
  private minioClient: Minio.Client;
  private bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.minioClient = new Minio.Client({
      endPoint: this.config.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.config.get('MINIO_PORT', '9000')),
      useSSL: this.config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.bucket = this.config.get('MINIO_BUCKET', 'task-tracker');
  }

  async createWorkspace(userId: string, data: any, ipAddress?: string) {
    const existing = await this.prisma.workspace.findUnique({ where: { slug: data.slug } });
    if (existing) throw new ConflictException('Workspace slug already taken');

    const workspace = await this.prisma.workspace.create({
      data: {
        name: data.name,
        slug: data.slug,
        logoUrl: data.logoUrl,
        ownerId: userId,
        members: {
          create: {
            userId: userId,
            role: 'Owner'
          }
        }
      },
      include: { members: true }
    });

    await this.auditLogService.log({
      event: AuditEventType.WORKSPACE_CREATED,
      workspaceId: workspace.id,
      actorId: userId,
      ipAddress,
      resourceType: 'Workspace',
      resourceId: workspace.id,
      resourceName: workspace.name,
    });

    return workspace;
  }

  async getUserWorkspaces(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true, projects: true }
            }
          }
        }
      },
      take: 100
    });

    return memberships.map(m => ({
      ...m.workspace,
      userRole: m.role,
      memberCount: m.workspace._count.members,
      projectCount: m.workspace._count.projects,
      _count: undefined
    }));
  }

  async getWorkspaceBySlug(userId: string, slug: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, fullName: true, email: true, avatarUrl: true, lastSeenAt: true }
            }
          }
        },
        invites: {
          where: { isUsed: false }
        }
      }
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    const membership = workspace.members.find(m => m.userId === userId);
    if (!membership) throw new ForbiddenException('Not a member of this workspace');

    return {
      ...workspace,
      userRole: membership.role
    };
  }

  async updateWorkspace(slug: string, data: any, userId?: string, ipAddress?: string) {
    const workspace = await this.prisma.workspace.update({
      where: { slug },
      data: { 
        name: data.name, 
        logoUrl: data.logoUrl,
        isInviteOnly: data.isInviteOnly,
        emailNotifications: data.emailNotifications
      }
    });

    if (userId) {
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_UPDATED,
        workspaceId: workspace.id,
        actorId: userId,
        ipAddress,
        resourceType: 'Workspace',
        resourceId: workspace.id,
        resourceName: workspace.name,
      });
    }

    return workspace;
  }

  async archiveWorkspace(slug: string, userId?: string, ipAddress?: string) {
    const workspace = await this.prisma.workspace.update({
      where: { slug },
      data: { isArchived: true }
    });

    if (userId) {
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_ARCHIVED,
        workspaceId: workspace.id,
        actorId: userId,
        ipAddress,
        resourceType: 'Workspace',
        resourceId: workspace.id,
        resourceName: workspace.name,
      });
    }

    return workspace;
  }

  async deleteWorkspace(slug: string, nameConfirm: string, userId?: string, ipAddress?: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.name !== nameConfirm) throw new BadRequestException('Workspace name confirmation does not match');

    if (userId) {
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_DELETED,
        workspaceId: workspace.id,
        actorId: userId,
        ipAddress,
        resourceType: 'Workspace',
        resourceId: workspace.id,
        resourceName: workspace.name,
      });
    }

    await this.prisma.workspace.delete({ where: { slug } });
    return { success: true };
  }

  async inviteMember(slug: string, data: any, inviterId: string, workspaceId: string, ipAddress?: string) {
    if (data.email) data.email = data.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: data.email }
    });

    if (user) {
      const existingMember = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId } }
      });
      if (existingMember) {
        throw new BadRequestException('This user is already a member of this workspace');
      }
    }

    const existingInvite = await this.prisma.invite.findFirst({
      where: { email: data.email, workspaceId }
    });
    if (existingInvite) {
      // If the invite is expired, we could delete it, but for now just throw
      if (existingInvite.expiresAt < new Date()) {
        await this.prisma.invite.delete({ where: { id: existingInvite.id } });
      } else {
        throw new BadRequestException('A pending invite has already been sent to this email');
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.prisma.invite.create({
      data: {
        email: data.email,
        role: data.role || 'Member',
        workspaceId,
        token,
        expiresAt,
      },
    });

    const frontendUrl = this.config.get('FRONTEND_URL') || 'http://localhost:3100';
    const inviteUrl = `${frontendUrl}/accept-invite?token=${token}`;
    
    const smtpHost = this.config.get('SMTP_HOST');
    
    if (smtpHost) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(this.config.get('SMTP_PORT', '587'), 10),
          secure: false,
          requireTLS: true,
          auth: {
            user: this.config.get('SMTP_USER'),
            pass: this.config.get('SMTP_PASS'),
          },
        });
        
        await transporter.sendMail({
          from: this.config.get('SMTP_FROM'),
          to: data.email,
          subject: `You've been invited to join a Workspace on Task Tracker!`,
          text: `You have been invited to join a workspace as a ${data.role || 'Member'}.\n\nPlease click the following link to accept the invite:\n${inviteUrl}`,
        });
        console.log(`Invite email sent to ${data.email}`);
      } catch (err: any) {
        console.error('Failed to send invite email', err);
        throw new BadRequestException('Failed to send invite email: ' + err.message);
      }
    } else {
      console.log(`[Email System Mock] Invite sent to ${data.email}: ${inviteUrl}`);
    }

    await this.auditLogService.log({
      event: AuditEventType.WORKSPACE_MEMBER_INVITED,
      workspaceId,
      actorId: inviterId,
      ipAddress,
      resourceType: 'User',
      resourceName: data.email,
      metadata: { role: data.role, email: data.email }
    });

    return { success: true, message: 'Invite sent successfully' };
  }

  async acceptInvite(userId: string, token: string, ipAddress?: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { workspace: true }
    });

    if (!invite) throw new BadRequestException('Invalid invite token');
    if (invite.isUsed) throw new BadRequestException('Invite has already been used');
    if (new Date() > invite.expiresAt) throw new BadRequestException('Invite has expired');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== invite.email) {
      throw new ForbiddenException(`This invite was sent to ${invite.email}. You are logged in as a different user.`);
    }

    const existingMember = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } }
    });

    if (existingMember) {
      throw new BadRequestException('You are already a member of this workspace');
    }

    await this.prisma.workspaceMember.create({
      data: {
        userId,
        workspaceId: invite.workspaceId,
        role: invite.role,
      }
    });

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { isUsed: true }
    });

    return { success: true, workspaceSlug: invite.workspace.slug };
  }

  async changeMemberRole(slug: string, targetUserId: string, newRole: any, workspaceId: string, actorId?: string, ipAddress?: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } }
    });

    if (!membership) throw new NotFoundException('Member not found in this workspace');
    if (membership.role === 'Owner') throw new BadRequestException('Cannot change role of the Owner');
    if (newRole === 'Owner') throw new BadRequestException('Cannot transfer ownership through this endpoint');

    const updated = await this.prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      data: { role: newRole }
    });

    if (actorId) {
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_MEMBER_ROLE_CHANGED,
        workspaceId: workspaceId,
        actorId,
        ipAddress,
        resourceType: 'WorkspaceMember',
        resourceId: updated.id,
        metadata: { targetUserId, newRole }
      });
    }

    return updated;
  }

  async removeMember(slug: string, targetUserId: string, removerId: string, removerRole: string, workspaceId: string, ipAddress?: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } }
    });

    if (!membership) throw new NotFoundException('Member not found in this workspace');
    if (membership.role === 'Owner') throw new BadRequestException('Cannot remove the Owner');
    if (membership.role === 'Admin' && removerRole !== 'Owner') {
      throw new ForbiddenException('Only the Owner can remove an Admin');
    }

    await this.prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } }
    });

    await this.auditLogService.log({
      event: AuditEventType.WORKSPACE_MEMBER_REMOVED,
      workspaceId,
      actorId: removerId,
      ipAddress,
      resourceType: 'User',
      resourceId: targetUserId,
    });

    return { success: true };
  }

  async uploadLogo(slug: string, file: Express.Multer.File, userId?: string, ipAddress?: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const bucketExists = await this.minioClient.bucketExists(this.bucket);
    if (!bucketExists) {
      await this.minioClient.makeBucket(this.bucket, 'us-east-1');
    }

    const ext = file.originalname.split('.').pop();
    const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const storageKey = `workspaces/${slug}/logo/${filename}`;

    await this.minioClient.putObject(this.bucket, storageKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    const protocol = this.config.get('MINIO_USE_SSL', 'false') === 'true' ? 'https' : 'http';
    const host = this.config.get('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get('MINIO_PORT', '9000');
    
    const url = `${protocol}://${host}:${port}/${this.bucket}/${storageKey}`;
    
    if (userId) {
      await this.auditLogService.log({
        event: AuditEventType.WORKSPACE_UPDATED,
        workspaceId: workspace.id,
        actorId: userId,
        ipAddress,
        resourceType: 'Workspace',
        resourceId: workspace.id,
        resourceName: workspace.name,
        metadata: { action: 'uploadLogo' }
      });
    }

    // We update the workspace automatically or just return the URL and let the client save it
    return { url };
  }
}
