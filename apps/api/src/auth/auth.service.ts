import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RegisterSchema, LoginSchema, InviteSchema, AcceptInviteSchema } from '@repo/shared';
import { z } from 'zod';
import { NotificationService } from '../notification/notification.service';
import { AuditLogService } from '../audit/audit.service';
import { AuditEventType } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async generateTokens(userId: string, email: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  async register(dto: any) {
    if (dto.email) dto.email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        notificationPref: {
          create: {
            emailEnabled: true,
            pushEnabled: false
          }
        }
      },
    });

    const tokens = await this.generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async login(dto: any, ipAddress?: string) {
    if (dto.email) dto.email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await this.comparePassword(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    await this.auditLogService.log({
      event: AuditEventType.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      ipAddress,
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    let payload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isMatch) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async logout(userId: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    if (user) {
      await this.auditLogService.log({
        event: AuditEventType.LOGOUT,
        actorId: user.id,
        actorEmail: user.email,
        ipAddress,
      });
    }

    return { success: true };
  }

  async validateGoogleUser(profile: any, ipAddress?: string) {
    const email = profile.emails[0].value.toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          fullName: profile.displayName,
          avatarUrl: profile.photos[0]?.value,
          isGoogleAuth: true,
          notificationPref: {
            create: {
              emailEnabled: true,
              pushEnabled: false
            }
          }
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    await this.auditLogService.log({
      event: AuditEventType.LOGIN_SUCCESS,
      actorId: user.id,
      actorEmail: user.email,
      ipAddress,
    });

    return { user, ...tokens };
  }

  async createInvite(userId: string, dto: any) {
    if (dto.email) dto.email = dto.email.toLowerCase();
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: dto.workspaceId } },
    });
    
    if (!member || (member.role !== 'Owner' && member.role !== 'Admin')) {
      throw new ForbiddenException('You must be an Owner or Admin to invite members');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.prisma.invite.create({
      data: {
        email: dto.email,
        role: dto.role as any,
        workspaceId: dto.workspaceId,
        token,
        expiresAt,
      },
    });

    const inviteUrl = `http://localhost:3000/accept-invite?token=${token}`;
    console.log(`[Email System Mock] Invite sent to ${dto.email}: ${inviteUrl}`);

    return { success: true, message: 'Invite sent successfully' };
  }

  async getInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { workspace: true }
    });
    
    if (!invite) {
      throw new BadRequestException('Invalid invite token');
    }
    if (invite.isUsed) {
      throw new BadRequestException('Invite has already been used');
    }
    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite has expired');
    }

    const userExists = await this.prisma.user.findUnique({ where: { email: invite.email } });
    
    return {
      workspaceName: invite.workspace.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
      email: invite.email,
      userExists: !!userExists
    };
  }

  async acceptInvite(dto: any) {
    const invite = await this.prisma.invite.findUnique({ where: { token: dto.token } });
    
    if (!invite) {
      throw new BadRequestException('Invalid invite token');
    }
    if (invite.isUsed) {
      throw new BadRequestException('Invite has already been used');
    }
    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite has expired');
    }

    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });

    if (user) {
      throw new BadRequestException('An account already exists for this email. Please log in to accept the invite.');
    }

    if (!dto.password || !dto.fullName) {
      throw new BadRequestException('Full name and password are required to register.');
    }

    const hashedPassword = await this.hashPassword(dto.password);
    user = await this.prisma.user.create({
      data: {
        email: invite.email,
        fullName: dto.fullName,
        password: hashedPassword,
        notificationPref: {
          create: {
            emailEnabled: true,
            pushEnabled: false
          }
        }
      },
    });

    await this.prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: invite.workspaceId,
        role: invite.role,
      },
    });

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { isUsed: true },
    });

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: invite.workspaceId },
      include: { owner: true }
    });

    if (workspace?.ownerId) {
      await this.notificationService.dispatch({
        recipientId: workspace.ownerId,
        type: 'member_joined',
        message: `${user.fullName} joined workspace "${workspace.name}" as ${invite.role}.`,
        referenceId: workspace.id,
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async forgotPassword(email: string) {
    email = email.toLowerCase();
    // Always return success to prevent user enumeration
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isGoogleAuth) return { success: true };

    // Invalidate existing tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, isUsed: false },
      data: { isUsed: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const smtpHost = this.configService.get('SMTP_HOST');
    if (smtpHost) {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: parseInt(this.configService.get('SMTP_PORT', '587'), 10),
        secure: false,
        requireTLS: true,
        auth: {
          user: this.configService.get('SMTP_USER'),
          pass: this.configService.get('SMTP_PASS'),
        },
      });
      const resetUrl = `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token=${token}`;
      await transporter.sendMail({
        from: this.configService.get('SMTP_FROM'),
        to: email,
        subject: 'Reset your Task Tracker password',
        html: `<p>Hi ${user.fullName},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`,
      });
    } else {
      const resetUrl = `http://localhost:3000/reset-password?token=${token}`;
      console.log(`[Email Mock] Password reset link for ${email}: ${resetUrl}`);
    }

    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.isUsed) {
      throw new BadRequestException('This reset link is invalid or has already been used.');
    }
    if (new Date() > resetToken.expiresAt) {
      throw new BadRequestException('EXPIRED: This reset link has expired. Please request a new one.');
    }

    const hashedPassword = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword, refreshToken: null },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { isUsed: true },
    });

    return { success: true };
  }
}
