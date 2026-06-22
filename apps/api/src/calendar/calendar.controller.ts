import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { CalendarService } from './calendar.service';

@Controller('workspaces/:slug/projects/:projectId')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('calendar/my')
  async getMyCalendar(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.getMyCalendar(userId, projectId, new Date(startDate), new Date(endDate));
  }

  @Get('calendar/team')
  async getTeamAvailability(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.getTeamAvailability(userId, projectId, new Date(startDate), new Date(endDate));
  }

  @Post('calendar/blocks')
  async createPersonalBlock(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() body: any,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.createPersonalBlock(userId, projectId, body);
  }

  @Patch('calendar/blocks/:blockId')
  async updatePersonalBlock(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('blockId') blockId: string,
    @Body() body: any,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.updatePersonalBlock(userId, projectId, blockId, body);
  }

  @Delete('calendar/blocks/:blockId')
  async deletePersonalBlock(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('blockId') blockId: string,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.deletePersonalBlock(userId, projectId, blockId);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('meetings/check-conflicts')
  async checkConflicts(
    @Body() body: { participants: string[], startDatetime: string, endDatetime: string },
  ) {
    return this.calendarService.checkConflicts(body.participants, body.startDatetime, body.endDatetime);
  }

  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('meetings')
  async createMeeting(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Body() body: any,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.createMeeting(userId, slug, projectId, body);
  }

  @Patch('meetings/:meetingId/respond')
  async respondToMeeting(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body('response') response: 'Accepted' | 'Declined',
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.respondToMeeting(userId, projectId, meetingId, response);
  }

  @Patch('meetings/:meetingId')
  async updateMeeting(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body() data: { startDatetime: string, endDatetime: string },
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.updateMeeting(userId, projectId, meetingId, data);
  }

  @Delete('meetings/:meetingId')
  async cancelMeeting(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.cancelMeeting(userId, projectId, meetingId);
  }
}
