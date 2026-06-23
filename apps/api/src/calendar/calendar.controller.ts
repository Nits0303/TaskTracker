import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { CalendarService } from './calendar.service';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CreatePersonalBlockDto, UpdatePersonalBlockDto, CheckConflictsDto, CreateMeetingDto, RespondToMeetingDto, UpdateMeetingDto } from './dto/calendar.dto';

@ApiTags('Calendar')
@ApiBearerAuth()
@Controller('workspaces/:slug/projects/:projectId')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @ApiOperation({ summary: 'Get current user calendar events' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiQuery({ name: 'startDate', description: 'Start date boundary (ISO)' })
  @ApiQuery({ name: 'endDate', description: 'End date boundary (ISO)' })
  @ApiResponse({ status: 200, description: 'List of calendar events.' })
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

  @ApiOperation({ summary: 'Get team availability' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiQuery({ name: 'startDate', description: 'Start date boundary (ISO)' })
  @ApiQuery({ name: 'endDate', description: 'End date boundary (ISO)' })
  @ApiResponse({ status: 200, description: 'List of team events.' })
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

  @ApiOperation({ summary: 'Create a personal calendar block' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Personal block created.' })
  @Post('calendar/blocks')
  async createPersonalBlock(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() body: CreatePersonalBlockDto,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.createPersonalBlock(userId, projectId, body);
  }

  @ApiOperation({ summary: 'Update a personal calendar block' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'blockId', description: 'Block ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Personal block updated.' })
  @Patch('calendar/blocks/:blockId')
  async updatePersonalBlock(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('blockId') blockId: string,
    @Body() body: UpdatePersonalBlockDto,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.updatePersonalBlock(userId, projectId, blockId, body);
  }

  @ApiOperation({ summary: 'Delete a personal calendar block' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'blockId', description: 'Block ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Personal block deleted.' })
  @Delete('calendar/blocks/:blockId')
  async deletePersonalBlock(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('blockId') blockId: string,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.deletePersonalBlock(userId, projectId, blockId);
  }

  @ApiOperation({ summary: 'Check scheduling conflicts for participants' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Conflict check results.' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('meetings/check-conflicts')
  async checkConflicts(
    @Body() body: CheckConflictsDto,
  ) {
    return this.calendarService.checkConflicts(body.participants, body.startDatetime, body.endDatetime);
  }

  @ApiOperation({ summary: 'Create a meeting request' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Meeting created.' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('meetings')
  async createMeeting(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Body() body: CreateMeetingDto,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.createMeeting(userId, slug, projectId, body);
  }

  @ApiOperation({ summary: 'Respond to a meeting request' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'meetingId', description: 'Meeting ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Response recorded.' })
  @Patch('meetings/:meetingId/respond')
  async respondToMeeting(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body() body: RespondToMeetingDto,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.respondToMeeting(userId, projectId, meetingId, body.response);
  }

  @ApiOperation({ summary: 'Update a meeting time' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'meetingId', description: 'Meeting ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Meeting updated.' })
  @Patch('meetings/:meetingId')
  async updateMeeting(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('meetingId') meetingId: string,
    @Body() data: UpdateMeetingDto,
  ) {
    const userId = (req.user as any).userId;
    return this.calendarService.updateMeeting(userId, projectId, meetingId, data);
  }

  @ApiOperation({ summary: 'Cancel a meeting' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'meetingId', description: 'Meeting ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Meeting cancelled.' })
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
