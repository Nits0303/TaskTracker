import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class UserService {
  private minioClient: Minio.Client;
  private bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        isGoogleAuth: true,
        createdAt: true,
        _count: {
          select: {
            workspaceMembers: true,
            assignedTasks: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      isGoogleAuth: user.isGoogleAuth,
      createdAt: user.createdAt,
      stats: {
        workspaceCount: user._count.workspaceMembers,
        assignedTaskCount: user._count.assignedTasks,
      },
    };
  }

  async updateProfile(userId: string, data: { fullName?: string }) {
    if (!data.fullName?.trim()) {
      throw new BadRequestException('Full name cannot be empty');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: data.fullName.trim() },
      select: { id: true, fullName: true, email: true, avatarUrl: true, isGoogleAuth: true },
    });
    return user;
  }

  async uploadAvatar(userId: string, buffer: Buffer, mimeType: string) {
    const ext = mimeType.split('/')[1] || 'jpg';
    const key = `avatars/${userId}.${ext}`;

    // Ensure bucket exists
    const exists = await this.minioClient.bucketExists(this.bucket);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucket, 'us-east-1');
    }

    // Set public read policy on bucket
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${this.bucket}/*`],
      }],
    });
    await this.minioClient.setBucketPolicy(this.bucket, policy);

    const stream = Readable.from(buffer);
    await this.minioClient.putObject(this.bucket, key, stream, buffer.length, {
      'Content-Type': mimeType,
    });

    const endpoint = this.config.get('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get('MINIO_PORT', '9000');
    const avatarUrl = `http://${endpoint}:${port}/${this.bucket}/${key}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isGoogleAuth) {
      throw new BadRequestException('Password cannot be changed for Google OAuth accounts.');
    }
    if (!user.password) {
      throw new BadRequestException('No password set for this account.');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect.');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters.');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return { success: true };
  }
}
