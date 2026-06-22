import { Injectable, ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ActivityService } from '../activity/activity.service';
import { NotificationService } from '../notification/notification.service';
import { AuditLogService } from '../audit/audit.service';
import { AuditEventType } from '@prisma/client';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly activityService: ActivityService,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getMyCalendar(userId: string, projectId: string, startDate: Date, endDate: Date) {
    const taskBlocks = await this.prisma.calendarBlock.findMany({
      where: {
        userId,
        startDatetime: { gte: startDate },
        endDatetime: { lte: endDate },
        taskId: { not: null },
      },
      include: {
        task: {
          select: { id: true, title: true, priority: true, status: true },
        },
      },
    });

    const personalBlocks = await this.prisma.calendarBlock.findMany({
      where: {
        userId,
        startDatetime: { gte: startDate },
        endDatetime: { lte: endDate },
        taskId: null,
      },
      include: {
        meetingRequest: {
          include: {
            requester: { select: { id: true, fullName: true, avatarUrl: true } },
            participants: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          }
        }
      }
    });

    const meetings = await this.prisma.meetingRequest.findMany({
      where: {
        OR: [
          { participants: { some: { userId } } },
          { requesterId: userId }
        ],
        startDatetime: { gte: startDate },
        endDatetime: { lte: endDate },
      },
      include: {
        requester: { select: { id: true, fullName: true, avatarUrl: true } },
        participants: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      },
    });

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId,
        assigneeId: userId,
        dueDate: { gte: startDate, lte: endDate },
      },
    });

    console.log('getMyCalendar called:', { taskBlocks: taskBlocks.length, personalBlocks: personalBlocks.length });

    return { taskBlocks, personalBlocks, meetings, tasks };
  }

  async getTeamAvailability(requesterId: string, projectId: string, startDate: Date, endDate: Date) {
    const requesterMember = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: requesterId, projectId } },
    });
    const requesterRole = requesterMember?.role || 'Viewer';

    const projectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    });

    const allBlocks = await this.prisma.calendarBlock.findMany({
      where: {
        userId: { in: projectMembers.map(pm => pm.userId) },
        startDatetime: { gte: startDate },
        endDatetime: { lte: endDate },
      },
      include: {
        meetingRequest: {
          include: {
            requester: { select: { id: true, fullName: true, avatarUrl: true } },
            participants: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          }
        }
      }
    });

    const pendingMeetings = await this.prisma.meetingRequest.findMany({
      where: {
        status: { in: ['Pending', 'Declined'] },
        startDatetime: { gte: startDate },
        endDatetime: { lte: endDate },
        OR: [
          { requesterId: { in: projectMembers.map(pm => pm.userId) } },
          { participants: { some: { userId: { in: projectMembers.map(pm => pm.userId) } } } }
        ]
      },
      include: {
        requester: { select: { id: true, fullName: true, avatarUrl: true } },
        participants: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      }
    });

    const availability = projectMembers.map(pm => {
      const busySlots = allBlocks
        .filter(b => b.userId === pm.userId)
        .map(b => {
          const isOwn = b.userId === requesterId;
          const showDetails = isOwn || requesterRole === 'Owner' || requesterRole === 'Admin';
          return {
            startDatetime: b.startDatetime,
            endDatetime: b.endDatetime,
            label: showDetails ? b.label : 'Busy',
            description: showDetails ? b.description : null,
            meetingRequestId: b.meetingRequestId,
            meetingRequest: showDetails ? b.meetingRequest : null,
          };
        });

      const memberPendingMeetings = pendingMeetings.filter(m => 
        m.requesterId === pm.userId || m.participants.some(p => p.userId === pm.userId)
      ).map(m => {
        const isOwn = m.requesterId === requesterId || m.participants.some(p => p.userId === requesterId);
        const showDetails = isOwn || requesterRole === 'Owner' || requesterRole === 'Admin';
        return {
          startDatetime: m.startDatetime,
          endDatetime: m.endDatetime,
          label: showDetails ? m.title : 'Busy (Pending)',
          description: showDetails ? 'Pending Meeting' : null,
          meetingRequestId: m.id,
          meetingRequest: showDetails ? m : null,
          isPending: true,
        };
      });

      const combinedBusySlots = [...busySlots, ...memberPendingMeetings];

      const freeSlots = [];
      // Calculate working hours free slots (9 AM to 7 PM)
      const current = new Date(startDate);
      while (current <= endDate) {
        const dayStart = new Date(current);
        dayStart.setHours(9, 0, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(19, 0, 0, 0);

        let currentFreeStart = dayStart;
        const todaysBusy = combinedBusySlots
          .filter(b => b.startDatetime >= dayStart && b.startDatetime < dayEnd)
          .sort((a, b) => a.startDatetime.getTime() - b.startDatetime.getTime());

        for (const busy of todaysBusy) {
          if (currentFreeStart < busy.startDatetime) {
            freeSlots.push({ startDatetime: currentFreeStart, endDatetime: busy.startDatetime });
          }
          if (busy.endDatetime > currentFreeStart) {
            currentFreeStart = busy.endDatetime;
          }
        }
        if (currentFreeStart < dayEnd) {
          freeSlots.push({ startDatetime: currentFreeStart, endDatetime: dayEnd });
        }
        current.setDate(current.getDate() + 1);
      }

      const initials = pm.user.fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return {
        userId: pm.userId,
        name: pm.user.fullName,
        initials,
        avatarUrl: pm.user.avatarUrl,
        busySlots: combinedBusySlots,
        freeSlots,
      };
    });

    return availability;
  }

  async checkConflicts(participants: string[], startDatetime: string, endDatetime: string) {
    const start = new Date(startDatetime);
    const end = new Date(endDatetime);

    const conflicts = await this.prisma.calendarBlock.findMany({
      where: {
        userId: { in: participants },
        startDatetime: { lt: end },
        endDatetime: { gt: start },
      },
      include: { user: true },
    });

    const conflictDetails = conflicts.map(c => ({
      userId: c.userId,
      name: c.user.fullName,
      type: c.taskId ? 'Task block' : 'Meeting',
    }));

    return { conflicts: conflictDetails };
  }

  async createMeeting(userId: string, workspaceSlug: string, projectId: string, data: any) {
    const { title, agenda, startDatetime, endDatetime, participants } = data;
    const start = new Date(startDatetime);
    const end = new Date(endDatetime);

    const workspace = await this.prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    // Check conflicts
    const conflicts = await this.prisma.calendarBlock.findMany({
      where: {
        userId: { in: participants },
        startDatetime: { lt: end },
        endDatetime: { gt: start },
      },
      include: { user: true },
    });

    if (conflicts.length > 0) {
      const conflictDetails = conflicts.map(c => ({
        userId: c.userId,
        name: c.user.fullName,
        type: c.taskId ? 'Task block' : 'Meeting',
      }));
      throw new ConflictException({ message: 'Time slot conflict', conflicts: conflictDetails });
    }

    const meeting = await this.prisma.meetingRequest.create({
      data: {
        title,
        agenda,
        startDatetime: start,
        endDatetime: end,
        requesterId: userId,
        workspaceId: workspace.id,
        projectId,
        status: 'Pending',
        participants: {
          create: participants.map((pId: string) => ({
            userId: pId,
            status: 'Pending',
          })),
        },
      },
      include: {
        requester: { select: { id: true, fullName: true, avatarUrl: true } },
        participants: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      },
    });

    for (const pId of participants) {
      this.realtime.emitToUser(pId, 'meeting:requested', meeting);
    }

    await this.activityService.logEvent({
      eventType: 'MeetingRequested',
      actorId: userId,
      projectId,
      metadata: { meetingId: meeting.id, title },
    });

    const participantUsers = await this.prisma.user.findMany({ where: { id: { in: participants } }, select: { fullName: true } });
    const participantNames = participantUsers.map(u => u.fullName).filter(Boolean);

    await this.auditLogService.log({
      event: AuditEventType.MEETING_REQUESTED,
      workspaceId: workspace.id,
      actorId: userId,
      resourceType: 'Project',
      resourceId: projectId,
      metadata: { title, startTime: startDatetime, endTime: endDatetime, participantNames, projectId }
    });

    return meeting;
  }

  async updateMeeting(userId: string, projectId: string, meetingId: string, data: { startDatetime: string, endDatetime: string }) {
    const meeting = await this.prisma.meetingRequest.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.requesterId !== userId) throw new ForbiddenException('Only requester can update meeting');

    const start = new Date(data.startDatetime);
    const end = new Date(data.endDatetime);

    // Check conflicts for all participants
    const participantIds = meeting.participants.map(p => p.userId);
    const conflicts = await this.prisma.calendarBlock.findMany({
      where: {
        userId: { in: participantIds },
        startDatetime: { lt: end },
        endDatetime: { gt: start },
      },
      include: { user: true },
    });

    // Ignore conflicts that belong to the current meeting itself
    const actualConflicts = conflicts.filter(c => c.meetingRequestId !== meetingId);

    if (actualConflicts.length > 0) {
      const conflictDetails = actualConflicts.map(c => ({
        userId: c.userId,
        name: c.user.fullName,
        type: c.taskId ? 'Task block' : 'Meeting',
      }));
      throw new ConflictException({ message: 'Time slot conflict', conflicts: conflictDetails });
    }

    const updatedMeeting = await this.prisma.meetingRequest.update({
      where: { id: meetingId },
      data: {
        startDatetime: start,
        endDatetime: end,
      },
      include: {
        requester: { select: { id: true, fullName: true, avatarUrl: true } },
        participants: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
      },
    });

    // Remove any existing calendar blocks for this meeting because the time changed
    // We will let the background task recreate them if needed. Or we just keep them?
    // Actually, if the status is still Accepted, we must UPDATE the calendar blocks instead of deleting them!
    // Since we don't want to lose their accepted status, we must update the blocks!
    await this.prisma.calendarBlock.updateMany({
      where: { meetingRequestId: meetingId },
      data: { startDatetime: start, endDatetime: end }
    });

    // Fetch the updated participants so the frontend gets the right 'Pending' state
    const refreshedParticipants = await this.prisma.meetingParticipant.findMany({
      where: { meetingRequestId: meetingId },
      include: { user: { select: { fullName: true, avatarUrl: true } } }
    });
    updatedMeeting.participants = refreshedParticipants as any;

    // Emit event to all participants
    const allIds = Array.from(new Set([...updatedMeeting.participants.map(p => p.userId), userId]));
    allIds.forEach(id => {
      this.realtime.emitToUser(id, 'meeting:updated', updatedMeeting);
      if (id !== userId) {
        this.notificationService.dispatch({
          recipientId: id,
          type: 'meeting_request',
          message: `${updatedMeeting.requester.fullName || 'Someone'} has changed the time for: ${updatedMeeting.title}`,
          referenceId: updatedMeeting.id,
        });
      }
    });

    return updatedMeeting;
  }

  async respondToMeeting(userId: string, projectId: string, meetingId: string, response: 'Accepted' | 'Declined') {
    const meeting = await this.prisma.meetingRequest.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const participant = meeting.participants.find(p => p.userId === userId);
    if (!participant) throw new ForbiddenException('Not a participant');

    await this.prisma.meetingParticipant.update({
      where: { id: participant.id },
      data: { status: response, respondedAt: new Date() },
    });

    await this.prisma.notification.updateMany({
      where: { recipientId: userId, type: 'meeting_request', referenceId: meetingId },
      data: { isRead: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    await this.notificationService.dispatch({
      recipientId: meeting.requesterId,
      type: 'meeting_response',
      message: `${user?.fullName || 'Someone'} has ${response.toLowerCase()} your meeting request: ${meeting.title}`,
      referenceId: meeting.id,
    });

    if (response === 'Accepted') {
      const updatedParticipants = await this.prisma.meetingParticipant.findMany({ where: { meetingRequestId: meetingId } });
      const allAccepted = updatedParticipants.every(p => p.status === 'Accepted');
      
      if (allAccepted) {
        const updatedMeeting = await this.prisma.meetingRequest.update({
          where: { id: meetingId },
          data: { status: 'Accepted' },
        });

        // Ensure we don't duplicate blocks
        const existingBlocks = await this.prisma.calendarBlock.findMany({ where: { meetingRequestId: meetingId } });
        if (existingBlocks.length === 0) {
          const blocks = updatedParticipants.map(p => ({
            userId: p.userId,
            meetingRequestId: meetingId,
            startDatetime: meeting.startDatetime,
            endDatetime: meeting.endDatetime,
            label: meeting.title,
          }));
          
          if (!updatedParticipants.some(p => p.userId === meeting.requesterId)) {
            blocks.push({
              userId: meeting.requesterId,
              meetingRequestId: meetingId,
              startDatetime: meeting.startDatetime,
              endDatetime: meeting.endDatetime,
              label: meeting.title,
            });
          }

          await this.prisma.calendarBlock.createMany({ data: blocks });
        }

        const allIds = Array.from(new Set([...updatedParticipants.map(p => p.userId), meeting.requesterId]));
        allIds.forEach(id => {
          this.realtime.emitToUser(id, 'meeting:updated', updatedMeeting);
        });

        await this.activityService.logEvent({
          eventType: 'MeetingAccepted',
          actorId: userId,
          projectId,
          metadata: { meetingId, title: meeting.title },
        });
      } else {
        // Just emit update since it's still pending globally
        const allIds = Array.from(new Set([...updatedParticipants.map(p => p.userId), meeting.requesterId]));
        allIds.forEach(id => {
          this.realtime.emitToUser(id, 'meeting:updated', { meetingId });
        });
      }
    } else {
      // Declined, so the meeting drops back to Pending state
      const updatedMeeting = await this.prisma.meetingRequest.update({
        where: { id: meetingId },
        data: { status: 'Pending' },
      });
      // Erase blocks in case it was previously fully accepted
      await this.prisma.calendarBlock.deleteMany({ where: { meetingRequestId: meetingId } });
      
      const updatedParticipants = await this.prisma.meetingParticipant.findMany({ where: { meetingRequestId: meetingId } });
      const allIds = Array.from(new Set([...updatedParticipants.map(p => p.userId), meeting.requesterId]));
      
      allIds.forEach(id => {
        this.realtime.emitToUser(id, 'meeting:updated', updatedMeeting);
      });

      await this.activityService.logEvent({
        eventType: 'MeetingDeclined',
        actorId: userId,
        projectId,
        metadata: { meetingId, title: meeting.title },
      });
    }

    return { success: true };
  }

  async cancelMeeting(userId: string, projectId: string, meetingId: string) {
    const meeting = await this.prisma.meetingRequest.findUnique({
      where: { id: meetingId },
      include: { participants: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.requesterId !== userId) throw new ForbiddenException('Only requester can cancel');

    await this.prisma.meetingRequest.update({
      where: { id: meetingId },
      data: { status: 'Cancelled' },
    });
    await this.prisma.calendarBlock.deleteMany({ where: { meetingRequestId: meetingId } });

    for (const p of meeting.participants) {
      await this.notificationService.dispatch({
        recipientId: p.userId,
        type: 'meeting_cancelled',
        message: `Meeting cancelled: ${meeting.title}`,
        referenceId: meeting.id,
      });
      this.realtime.emitToUser(p.userId, 'meeting:cancelled', { meetingId });
    }

    return { success: true };
  }

  async createPersonalBlock(userId: string, projectId: string, data: any) {
    const { title, description, startDatetime, endDatetime } = data;
    const start = new Date(startDatetime);
    const end = new Date(endDatetime);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      throw new BadRequestException('Cannot create blocks on past dates');
    }

    const block = await this.prisma.calendarBlock.create({
      data: {
        userId,
        label: title,
        description,
        startDatetime: start,
        endDatetime: end,
      },
    });

    return block;
  }

  async updatePersonalBlock(userId: string, projectId: string, blockId: string, data: any) {
    const { title, description, startDatetime, endDatetime } = data;
    const start = new Date(startDatetime);
    const end = new Date(endDatetime);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      throw new BadRequestException('Cannot update blocks to past dates');
    }

    const existingBlock = await this.prisma.calendarBlock.findUnique({ where: { id: blockId } });
    if (!existingBlock) throw new NotFoundException('Block not found');
    if (existingBlock.startDatetime < today) {
      throw new BadRequestException('Cannot modify blocks from past dates');
    }

    const block = await this.prisma.calendarBlock.update({
      where: { id: blockId },
      data: {
        label: title,
        description,
        startDatetime: start,
        endDatetime: end,
      },
    });

    return block;
  }

  async deletePersonalBlock(userId: string, projectId: string, blockId: string) {
    const block = await this.prisma.calendarBlock.findUnique({ where: { id: blockId } });
    if (!block) throw new NotFoundException('Block not found');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (block.startDatetime < today) {
      throw new BadRequestException('Cannot delete blocks from past dates');
    }

    if (block.userId !== userId) throw new ForbiddenException('Not your block');
    if (block.taskId || block.meetingRequestId) throw new ForbiddenException('Cannot delete managed block here');

    await this.prisma.calendarBlock.delete({ where: { id: blockId } });
    return { success: true };
  }
}
