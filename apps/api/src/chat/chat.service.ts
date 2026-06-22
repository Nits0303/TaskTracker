import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import * as Minio from 'minio';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ChatService {
  private minioClient: Minio.Client;
  private bucket: string;
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private config: ConfigService,
    private notificationService: NotificationService,
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

  // --- Channels ---
  async createChannel(userId: string, projectId: string, dto: any) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);

    const { name, description, isPrivate, initialMembers } = dto;
    
    const channel = await this.prisma.channel.create({
      data: {
        name,
        description,
        isPrivate: !!isPrivate,
        workspaceId: project.workspaceId,
        projectId,
        creatorId: userId,
        members: (isPrivate && initialMembers && initialMembers.length > 0)
          ? {
              create: initialMembers.map((memberId: string) => ({ userId: memberId }))
            }
          : undefined
      },
      include: {
        members: true
      }
    });
    // Ensure creator is also a member if private
    if (isPrivate) {
      await this.ensureMemberExists(userId, channel.id);
      
      if (initialMembers && initialMembers.length > 0) {
        for (const memberId of initialMembers) {
          if (memberId !== userId) {
            this.notificationService.dispatch({
              recipientId: memberId,
              type: 'Channel Addition',
              message: `You have been added to the private channel "#${channel.name}".`,
              referenceId: channel.id
            });
          }
        }
      }
    } else {
      const projectMembers = await this.prisma.projectMember.findMany({
        where: { projectId },
        select: { userId: true }
      });
      for (const pm of projectMembers) {
        if (pm.userId !== userId) {
          this.notificationService.dispatch({
            recipientId: pm.userId,
            type: 'Channel Addition',
            message: `A new public channel "#${channel.name}" has been created in your project.`,
            referenceId: channel.id
          });
        }
      }
    }
    return channel;
  }

  async getConversations(userId: string, slug: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new HttpException('Workspace not found', HttpStatus.NOT_FOUND);

    const channels = await this.prisma.channel.findMany({
      where: {
        workspaceId: workspace.id,
        type: 'Direct',
        members: { some: { userId } },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true } }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { attachments: true }
        }
      }
    });

    const result = await Promise.all(channels.map(async ch => {
      let unreadCount = 0;
      const me = ch.members.find(m => m.userId === userId);
      const other = ch.members.find(m => m.userId !== userId);
      
      if (me) {
        if (me.lastReadMessageId) {
          const lastRead = await this.prisma.message.findUnique({ where: { id: me.lastReadMessageId }});
          if (lastRead) {
            unreadCount = await this.getChannelUnreadCount(userId, ch.id, '', lastRead.createdAt);
          }
        } else {
          unreadCount = await this.getChannelUnreadCount(userId, ch.id, '');
        }
      }

      return {
        id: ch.id,
        otherParticipant: other?.user,
        lastMessage: ch.messages[0],
        unreadCount,
        updatedAt: ch.messages[0]?.createdAt || ch.createdAt
      };
    }));

    return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getChannelUnreadCount(userId: string, channelId: string, projectId: string, lastReadDate?: Date) {
    const unreadMessages = await this.prisma.message.findMany({
      where: {
        channelId,
        createdAt: lastReadDate ? { gt: lastReadDate } : undefined,
        authorId: { not: userId }
      }
    });

    const channelMute = await this.prisma.channelMute.findFirst({
      where: { userId, channelId, OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] }
    });
    const projectMute = await this.prisma.projectChatMute.findFirst({
      where: { userId, projectId, OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] }
    });
    const isMuted = !!channelMute || !!projectMute;

    if (!isMuted) return unreadMessages.length;

    let count = 0;
    for (const msg of unreadMessages) {
      const mentions: any[] = (msg.mentions as any) || [];
      const hasDirect = mentions.some(m => m.type === 'user' && m.targetId === userId);
      const hasAll = mentions.some(m => m.type === 'all');
      let hasTask = false;
      const taskMentions = mentions.filter(m => m.type === 'task');
      for (const tm of taskMentions) {
        const task = await this.prisma.task.findUnique({ where: { id: tm.targetId } });
        if (task?.assigneeId === userId) {
          hasTask = true;
          break;
        }
      }
      if (hasDirect || hasAll || hasTask) {
        count++;
      }
    }
    return count;
  }

  async getChannels(userId: string, projectId: string) {
    const channels = await this.prisma.channel.findMany({
      where: {
        projectId,
        OR: [
          { isPrivate: false },
          { members: { some: { userId } } },
        ]
      },
      include: {
        _count: { select: { members: true } },
        members: { where: { userId } } 
      }
    });

    const result = await Promise.all(channels.map(async ch => {
      let unreadCount = 0;
      const member = ch.members[0];
      if (member) {
        if (member.lastReadMessageId) {
          const lastRead = await this.prisma.message.findUnique({ where: { id: member.lastReadMessageId }});
          if (lastRead) {
            unreadCount = await this.getChannelUnreadCount(userId, ch.id, projectId, lastRead.createdAt);
          }
        } else {
          unreadCount = await this.getChannelUnreadCount(userId, ch.id, projectId);
        }
      }
      
      const channelMute = await this.prisma.channelMute.findFirst({
        where: { userId, channelId: ch.id, OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] }
      });

      return {
        id: ch.id,
        name: ch.name,
        description: ch.description,
        isPrivate: ch.isPrivate,
        memberCount: ch._count.members,
        unreadCount,
        isMuted: !!channelMute,
        mutedUntil: channelMute?.mutedUntil,
        creatorId: ch.creatorId
      };
    }));
    return result;
  }

  async getChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true } }
          }
        }
      }
    });
    if (!channel) throw new HttpException('Channel not found', HttpStatus.NOT_FOUND);
    if (channel.isPrivate && !channel.members.some(m => m.userId === userId)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    if (channel.type === 'Direct' && !channel.members.some(m => m.userId === userId)) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return channel;
  }

  async addMember(userId: string, channelId: string, targetUserId: string) {
    const channel = await this.getChannel(userId, channelId);
    if (!channel.isPrivate) throw new HttpException('Channel is public', HttpStatus.BAD_REQUEST);

    const isCreator = channel.creatorId === userId;
    const projectMember = channel.projectId ? await this.prisma.projectMember.findFirst({
        where: { userId, projectId: channel.projectId }
    }) : null;
    const isAdmin = projectMember?.role === 'Admin' || projectMember?.role === 'Owner';
    if (!isCreator && !isAdmin) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    const member = await this.prisma.channelMember.create({
      data: {
        userId: targetUserId,
        channelId
      }
    });
    
    await this.emitToChannel(channel, 'chat:member_added', { channelId, userId: targetUserId });
    
    this.notificationService.dispatch({
      recipientId: targetUserId,
      type: 'Channel Addition',
      message: `You have been added to the private channel "#${channel.name}".`,
      referenceId: channel.id
    });
    
    return member;
  }

  async removeMember(userId: string, channelId: string, targetUserId: string) {
    const channel = await this.getChannel(userId, channelId);
    const isCreator = channel.creatorId === userId;
    const projectMember = channel.projectId ? await this.prisma.projectMember.findFirst({
        where: { userId, projectId: channel.projectId }
    }) : null;
    const isAdmin = projectMember?.role === 'Admin' || projectMember?.role === 'Owner';
    if (!isCreator && !isAdmin) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    const deleted = await this.prisma.channelMember.delete({
      where: {
        userId_channelId: { userId: targetUserId, channelId }
      }
    });
    
    await this.emitToChannel(channel, 'chat:member_removed', { channelId, userId: targetUserId });
    return deleted;
  }

  async updateChannel(userId: string, channelId: string, data: any) {
    const channel = await this.getChannel(userId, channelId);
    
    // Check if user is creator or admin
    const isCreator = channel.creatorId === userId;
    const projectMember = channel.projectId ? await this.prisma.projectMember.findFirst({
        where: { userId, projectId: channel.projectId }
    }) : null;
    const isAdmin = projectMember?.role === 'Admin' || projectMember?.role === 'Owner';
    if (!isCreator && !isAdmin) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        description: data.description !== undefined ? data.description : undefined,
      }
    });
    
    await this.emitToChannel(channel, 'chat:channel_updated', updated);
    return updated;
  }

  async deleteChannel(channelId: string, confirmName: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.name !== confirmName) {
      throw new HttpException('Channel name does not match', HttpStatus.BAD_REQUEST);
    }
    
    // Emit before deletion so we can still get members if private
    await this.emitToChannel(channel, 'chat:channel_deleted', { channelId });
    
    return this.prisma.channel.delete({ where: { id: channelId } });
  }

  // --- Messages ---
  async getMessages(userId: string, channelId: string, before?: string, take: number = 50) {
    await this.getChannel(userId, channelId);
    
    let cursorObj = undefined;
    if (before) {
      cursorObj = { id: before };
    }

    const messages = await this.prisma.message.findMany({
      where: { channelId },
      take,
      skip: before ? 1 : 0,
      cursor: cursorObj,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
        _count: { select: { replies: true } },
        parentMessage: { select: { id: true, body: true, author: { select: { fullName: true } }, attachments: true } }
      }
    });
    
    // Convert to oldest-first and add download URLs
    const processed = await Promise.all(messages.map(async msg => {
      const getAttUrls = async (att: any) => {
        let downloadUrl = '';
        let previewUrl = '';
        try {
          downloadUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
            'response-content-disposition': `attachment; filename="${att.fileName}"`,
          });
          previewUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
            'response-content-disposition': `inline; filename="${att.fileName}"`,
          });
        } catch {}
        return { ...att, downloadUrl, previewUrl };
      };

      const mappedAttachments = await Promise.all(msg.attachments.map(getAttUrls));
      
      let mappedParentMessage = msg.parentMessage;
      if (mappedParentMessage?.attachments?.length) {
        mappedParentMessage = {
          ...mappedParentMessage,
          attachments: await Promise.all(mappedParentMessage.attachments.map(getAttUrls))
        };
      }

      return { ...msg, attachments: mappedAttachments, parentMessage: mappedParentMessage };
    }));
    return processed.reverse();
  }

  async getThread(userId: string, channelId: string, messageId: string, before?: string, take: number = 50) {
    await this.getChannel(userId, channelId);
    
    let cursorObj = undefined;
    if (before) {
      cursorObj = { id: before };
    }

    const messages = await this.prisma.message.findMany({
      where: { channelId, parentMessageId: messageId },
      take,
      skip: before ? 1 : 0,
      cursor: cursorObj,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
      }
    });
    
    const processed = await Promise.all(messages.map(async msg => {
      const mappedAttachments = await Promise.all(msg.attachments.map(async att => {
        let downloadUrl = '';
        let previewUrl = '';
        try {
          downloadUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
            'response-content-disposition': `attachment; filename="${att.fileName}"`,
          });
          previewUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
            'response-content-disposition': `inline; filename="${att.fileName}"`,
          });
        } catch {}
        return { ...att, downloadUrl, previewUrl };
      }));
      return { ...msg, attachments: mappedAttachments };
    }));
    return processed.reverse();
  }

  private async parseMentions(projectId: string, body: string) {
    const mentions: any[] = [];
    if (!body) return mentions;

    if (body.includes('@all')) {
      mentions.push({ type: 'all' });
    }

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true }
    });

    for (const member of members) {
      if (body.includes(`@${member.user.fullName}`)) {
        mentions.push({ type: 'user', targetId: member.userId, name: member.user.fullName });
      }
    }

    const openTasks = await this.prisma.task.findMany({
      where: { projectId }
    });

    const taskCandidates = [...body.matchAll(/\/([a-zA-Z0-9_ -]+)/g)].map(m => m[1].trim()).filter(Boolean);
    for (const candidate of taskCandidates) {
      let bestMatch = openTasks.find(t => t.title.toLowerCase() === candidate.toLowerCase());
      if (!bestMatch) {
        bestMatch = openTasks.find(t => t.title.toLowerCase().includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(t.title.toLowerCase()));
      }
      if (bestMatch && !mentions.find(m => m.type === 'task' && m.targetId === bestMatch!.id)) {
        mentions.push({ type: 'task', targetId: bestMatch.id, name: bestMatch.title });
      }
    }

    return mentions;
  }

  async createDirectMessage(userId: string, slug: string, dto: any) {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new HttpException('Workspace not found', HttpStatus.NOT_FOUND);

    let channelId = dto.channelId;

    if (!channelId && dto.targetUserId) {
      if (userId === dto.targetUserId) {
        throw new HttpException('Cannot start conversation with yourself', HttpStatus.BAD_REQUEST);
      }
      const p1 = userId < dto.targetUserId ? userId : dto.targetUserId;
      const p2 = userId < dto.targetUserId ? dto.targetUserId : userId;

      const existing = await this.prisma.channel.findUnique({
        where: {
          workspaceId_participant1Id_participant2Id: {
            workspaceId: workspace.id,
            participant1Id: p1,
            participant2Id: p2
          }
        }
      });

      if (existing) {
        channelId = existing.id;
      } else {
        const newChannel = await this.prisma.$transaction(async (tx) => {
          return tx.channel.create({
            data: {
              name: `DM-${p1}-${p2}`,
              isPrivate: true,
              type: 'Direct',
              workspaceId: workspace.id,
              creatorId: userId,
              participant1Id: p1,
              participant2Id: p2,
              members: {
                create: [
                  { userId: p1 },
                  { userId: p2 }
                ]
              }
            }
          });
        });
        channelId = newChannel.id;
      }
    }

    if (!channelId) throw new HttpException('Channel ID or target user ID required', HttpStatus.BAD_REQUEST);

    const channel = await this.getChannel(userId, channelId);
    if (!dto.body && !dto.hasAttachments) throw new HttpException('Body required unless attachments present', HttpStatus.BAD_REQUEST);

    const mentions = await this.parseMentions(channel.projectId || '', dto.body || '');

    const message = await this.prisma.message.create({
      data: {
        body: dto.body || '',
        channelId,
        authorId: userId,
        parentMessageId: dto.parentMessageId || null,
        mentions
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
        _count: { select: { replies: true } },
        parentMessage: { select: { id: true, body: true, author: { select: { fullName: true } }, attachments: true } }
      }
    });

    let mappedParentMessage = message.parentMessage;
    if (mappedParentMessage?.attachments?.length) {
      mappedParentMessage = {
        ...mappedParentMessage,
        attachments: await Promise.all(mappedParentMessage.attachments.map(async att => {
          let downloadUrl = '';
          let previewUrl = '';
          try {
            downloadUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
              'response-content-disposition': `attachment; filename="${att.fileName}"`,
            });
            previewUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
              'response-content-disposition': `inline; filename="${att.fileName}"`,
            });
          } catch {}
          return { ...att, downloadUrl, previewUrl };
        }))
      };
    }

    const payload = { ...message, parentMessage: mappedParentMessage };
    await this.emitToChannel(channel, 'chat:message_created', payload);

    const recipientId = dto.targetUserId || (channel.participant1Id === userId ? channel.participant2Id : channel.participant1Id);
    if (recipientId && recipientId !== userId) {
      this.notificationService.dispatch({
        recipientId,
        type: 'direct_message',
        message: `${message.author.fullName} sent you a direct message`,
        referenceId: channel.id
      });
    }

    mentions.forEach((m: any) => {
      if (m.type === 'user' && m.targetId !== userId) {
        this.notificationService.dispatch({
          recipientId: m.targetId,
          type: 'mention',
          message: `${message.author.fullName} mentioned you in a direct message`,
          referenceId: channel.id
        });
      }
    });

    return { channel, message: payload };
  }

  async createMessage(userId: string, projectId: string, channelId: string, dto: any) {
    const channel = await this.getChannel(userId, channelId);
    if (!dto.body && !dto.hasAttachments) throw new HttpException('Body required unless attachments present', HttpStatus.BAD_REQUEST);

    await this.ensureMemberExists(userId, channelId);

    const mentions = await this.parseMentions(projectId, dto.body || '');

    const message = await this.prisma.message.create({
      data: {
        body: dto.body || '',
        channelId,
        authorId: userId,
        parentMessageId: dto.parentMessageId || null,
        mentions
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
        _count: { select: { replies: true } },
        parentMessage: { select: { id: true, body: true, author: { select: { fullName: true } }, attachments: true } }
      }
    });

    let mappedParentMessage = message.parentMessage;
    if (mappedParentMessage?.attachments?.length) {
      mappedParentMessage = {
        ...mappedParentMessage,
        attachments: await Promise.all(mappedParentMessage.attachments.map(async att => {
          let downloadUrl = '';
          let previewUrl = '';
          try {
            downloadUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
              'response-content-disposition': `attachment; filename="${att.fileName}"`,
            });
            previewUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
              'response-content-disposition': `inline; filename="${att.fileName}"`,
            });
          } catch {}
          return { ...att, downloadUrl, previewUrl };
        }))
      };
    }

    const payload = { ...message, parentMessage: mappedParentMessage };
    await this.emitToChannel(channel, 'chat:message_created', payload);

    const projectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true }
    });

    for (const member of projectMembers) {
      if (member.userId === userId) continue;
      
      const channelMute = await this.prisma.channelMute.findFirst({
        where: { userId: member.userId, channelId, OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] }
      });
      const projectMute = await this.prisma.projectChatMute.findFirst({
        where: { userId: member.userId, projectId, OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] }
      });
      const isMuted = !!channelMute || !!projectMute;

      let counts = !isMuted;
      if (isMuted) {
         const hasDirect = mentions.some(m => m.type === 'user' && m.targetId === member.userId);
         const hasAll = mentions.some(m => m.type === 'all');
         let hasTask = false;
         for (const tm of mentions.filter(m => m.type === 'task')) {
           const task = await this.prisma.task.findUnique({ where: { id: tm.targetId } });
           if (task?.assigneeId === member.userId) { hasTask = true; break; }
         }
         if (hasDirect || hasAll || hasTask) counts = true;
      }

      if (counts) {
        const allChannels = await this.getChannels(member.userId, projectId);
        const totalUnreadCount = allChannels.reduce((sum, ch) => sum + ch.unreadCount, 0);
        const thisChannel = allChannels.find(c => c.id === channelId);
        
        this.realtime.server.to(`user:${member.userId}`).emit('chat:badge_update', {
          projectId,
          channelId,
          unreadCount: thisChannel?.unreadCount || 0,
          totalUnreadCount
        });
      }
    }

    mentions.forEach((m: any) => {
      if (m.type === 'user' && m.targetId !== userId) {
        this.notificationService.dispatch({
          recipientId: m.targetId,
          type: 'mention',
          message: `${message.author.fullName} mentioned you in #${channel.name}`,
          referenceId: channel.id
        });
      } else if (m.type === 'all') {
        projectMembers.forEach(member => {
          if (member.userId !== userId) {
            this.notificationService.dispatch({
              recipientId: member.userId,
              type: 'mention',
              message: `${message.author.fullName} mentioned @all in #${channel.name}`,
              referenceId: channel.id
            });
          }
        });
      }
    });

    return payload;
  }

  async updateMessage(userId: string, channelId: string, messageId: string, dto: any) {
    const channel = await this.getChannel(userId, channelId);
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.authorId !== userId) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    const mentions = await this.parseMentions(channel.projectId || '', dto.body || '');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { body: dto.body, isEdited: true, mentions },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
        _count: { select: { replies: true } }
      }
    });

    await this.emitToChannel(channel, 'chat:message_updated', { channelId, messageId, fields: { body: updated.body, isEdited: true, mentions }});
    return updated;
  }

  async deleteMessage(userId: string, channelId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, include: { channel: true } });
    if (!message) throw new HttpException('Not found', HttpStatus.NOT_FOUND);

    const projectMember = message.channel.projectId ? await this.prisma.projectMember.findFirst({
        where: { userId, projectId: message.channel.projectId }
    }) : null;
    const isAdmin = projectMember?.role === 'Admin' || projectMember?.role === 'Owner';
    if (message.authorId !== userId && !isAdmin) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true }
    });

    const channel = await this.getChannel(userId, channelId);
    await this.emitToChannel(channel, 'chat:message_deleted', { channelId, messageId });
    return { success: true };
  }

  // --- Mute ---
  async muteChannel(userId: string, channelId: string, duration: string) {
    let mutedUntil: Date | null = null;
    if (duration === '1hr') mutedUntil = new Date(Date.now() + 60 * 60 * 1000);
    else if (duration === '1day') mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const channelMute = await this.prisma.channelMute.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { mutedUntil },
      create: { userId, channelId, mutedUntil }
    });
    return channelMute;
  }

  async unmuteChannel(userId: string, channelId: string) {
    await this.prisma.channelMute.deleteMany({
      where: { userId, channelId }
    });
    return { success: true };
  }

  async muteProjectChat(userId: string, projectId: string, duration: string) {
    let mutedUntil: Date | null = null;
    if (duration === '1hr') mutedUntil = new Date(Date.now() + 60 * 60 * 1000);
    else if (duration === '1day') mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const projectMute = await this.prisma.projectChatMute.upsert({
      where: { userId_projectId: { userId, projectId } },
      update: { mutedUntil },
      create: { userId, projectId, mutedUntil }
    });
    return projectMute;
  }

  async unmuteProjectChat(userId: string, projectId: string) {
    await this.prisma.projectChatMute.deleteMany({
      where: { userId, projectId }
    });
    return { success: true };
  }

  async getMuteStatus(userId: string, projectId: string) {
    const projectMute = await this.prisma.projectChatMute.findFirst({
      where: { userId, projectId, OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] }
    });
    return { projectMute: !!projectMute };
  }

  // --- Attachments ---
  async uploadAttachment(userId: string, slug: string, projectId: string, channelId: string, messageId: string, file: Express.Multer.File) {
    await this.getChannel(userId, channelId);

    const bucketExists = await this.minioClient.bucketExists(this.bucket);
    if (!bucketExists) {
      await this.minioClient.makeBucket(this.bucket, 'us-east-1');
    }

    const storageKey = `chat/${slug}/${projectId}/${channelId}/${messageId}/${file.originalname}`;
    await this.minioClient.putObject(this.bucket, storageKey, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        fileName: file.originalname,
        storageKey,
        fileSize: file.size,
        mimeType: file.mimetype,
        messageId,
        uploaderId: userId
      }
    });

    const channel = await this.getChannel(userId, channelId);
    const updatedMsg = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
        _count: { select: { replies: true } }
      }
    });

    if (!updatedMsg) {
      throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
    }
    
    // Get presigned urls for all attachments of this message to emit
    const mappedAttachments = await Promise.all(updatedMsg.attachments.map(async att => {
        let downloadUrl = '';
        let previewUrl = '';
        try {
          downloadUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
            'response-content-disposition': `attachment; filename="${att.fileName}"`,
          });
          previewUrl = await this.minioClient.presignedGetObject(this.bucket, att.storageKey, 60 * 60, {
            'response-content-disposition': `inline; filename="${att.fileName}"`,
          });
        } catch {}
        return { ...att, downloadUrl, previewUrl };
    }));
    
    await this.emitToChannel(channel, 'chat:message_updated', { channelId, messageId, fields: { attachments: mappedAttachments }});

    let downloadUrl = '';
    let previewUrl = '';
    try {
      downloadUrl = await this.minioClient.presignedGetObject(this.bucket, storageKey, 60 * 60, {
        'response-content-disposition': `attachment; filename="${file.originalname}"`,
      });
      previewUrl = await this.minioClient.presignedGetObject(this.bucket, storageKey, 60 * 60, {
        'response-content-disposition': `inline; filename="${file.originalname}"`,
      });
    } catch {}

    return { ...attachment, downloadUrl, previewUrl };
  }

  // --- Read Receipts ---
  async markRead(userId: string, channelId: string, messageId: string) {
    await this.ensureMemberExists(userId, channelId);
    await this.prisma.channelMember.update({
      where: { userId_channelId: { userId, channelId } },
      data: { lastReadMessageId: messageId }
    });

    const channel = await this.getChannel(userId, channelId);
    await this.emitToChannel(channel, 'chat:read_receipt_updated', { userId, lastReadMessageId: messageId });
    return { success: true };
  }

  async getSeenBy(channelId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return [];

    const members = await this.prisma.channelMember.findMany({
      where: { channelId, lastReadMessageId: { not: null } },
      include: { lastReadMessage: true, user: { select: { id: true, fullName: true, avatarUrl: true } } }
    });

    return members
      .filter(m => m.lastReadMessage && m.lastReadMessage.createdAt >= message.createdAt)
      .map(m => m.user);
  }

  // --- Helpers ---
  private async ensureMemberExists(userId: string, channelId: string) {
    const exists = await this.prisma.channelMember.findUnique({
      where: { userId_channelId: { userId, channelId } }
    });
    if (!exists) {
      await this.prisma.channelMember.create({ data: { userId, channelId }});
    }
  }

  private async emitToChannel(channel: any, event: string, data: any) {
    if (channel.type === 'Direct') {
      const members = await this.prisma.channelMember.findMany({ where: { channelId: channel.id } });
      const userIds = members.map(m => m.userId);
      this.realtime.emitToUsers(userIds, event, data);
    } else if (channel.isPrivate) {
      // Find explicit members from db
      const members = await this.prisma.channelMember.findMany({ where: { channelId: channel.id } });
      const userIds = members.map(m => m.userId);
      this.realtime.emitToUsers(userIds, event, data);
    } else {
      this.realtime.emitToProject(channel.projectId, event, data);
    }
  }
}
