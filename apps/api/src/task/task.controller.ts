import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards, UseInterceptors,
  UploadedFile, HttpException, HttpStatus, Headers
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../common/guards/custom-throttler.guard';
import { ProjectRoleGuard } from '../project/guards/project-role.guard';
import { RequireProjectRole } from '../project/decorators/require-project-role.decorator';
import { Role } from '@prisma/client';
import { CreateTaskSchema, UpdateTaskSchema } from '@repo/shared';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CreateTaskDto, UpdateTaskDto, ReorderTaskDto, CreateSubTaskDto, UpdateSubTaskDto, CreateCommentDto } from './dto/task.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('workspaces/:slug/projects/:projectId/tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  // --- Tasks ---
  @ApiOperation({ summary: 'Create a new task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Task created.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Post()
  @RequireProjectRole(Role.Member)
  async createTask(@Req() req: any, @Param('projectId') projectId: string, @Body() body: CreateTaskDto, @Headers('x-socket-id') socketId?: string) {
    console.log('--- CREATE TASK PAYLOAD ---', body);
    const result = CreateTaskSchema.omit({ projectId: true }).safeParse(body);
    if (!result.success) {
      console.log('--- VALIDATION ERROR ---', JSON.stringify(result.error.format(), null, 2));
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.taskService.createTask(req.user.userId, projectId, result.data, socketId);
  }

  @ApiOperation({ summary: 'Get all tasks for a project' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'List of tasks.' })
  @Get()
  @RequireProjectRole(Role.Viewer)
  async getTasks(@Param('projectId') projectId: string) {
    return this.taskService.getTasks(projectId);
  }

  @ApiOperation({ summary: 'Get a specific task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Task details.' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Get(':taskId')
  @RequireProjectRole(Role.Viewer)
  async getTask(@Param('taskId') taskId: string) {
    return this.taskService.getTask(taskId);
  }

  @ApiOperation({ summary: 'Update a specific task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Task updated.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Patch(':taskId')
  @RequireProjectRole(Role.Viewer)
  async updateTask(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskDto,
    @Headers('x-socket-id') socketId?: string
  ) {
    const result = UpdateTaskSchema.omit({ projectId: true }).safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.taskService.updateTask(req.user.userId, projectId, taskId, result.data, socketId);
  }

  @ApiOperation({ summary: 'Reorder a task (change sortOrder)' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Task reordered.' })
  @Patch(':taskId/reorder')
  @RequireProjectRole(Role.Member)
  async reorderTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: ReorderTaskDto, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.reorderTask(projectId, taskId, body, socketId);
  }

  @ApiOperation({ summary: 'Delete a specific task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Task deleted.' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @Delete(':taskId')
  @RequireProjectRole(Role.Admin)
  async deleteTask(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.deleteTask(req.user.userId, projectId, taskId, socketId);
  }

  // --- SubTasks ---
  @ApiOperation({ summary: 'Create a sub-task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Parent Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Sub-task created.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @Post(':taskId/subtasks')
  @RequireProjectRole(Role.Member)
  async createSubTask(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: CreateSubTaskDto, @Headers('x-socket-id') socketId?: string) {
    if (!body.title) throw new HttpException({ message: 'title is required' }, HttpStatus.BAD_REQUEST);
    return this.taskService.createSubTask(req.user.userId, projectId, taskId, body, socketId);
  }

  @ApiOperation({ summary: 'Update a sub-task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Parent Task ID', example: 'uuid-here' })
  @ApiParam({ name: 'subtaskId', description: 'Sub-task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Sub-task updated.' })
  @Patch(':taskId/subtasks/:subtaskId')
  @RequireProjectRole(Role.Member)
  async updateSubTask(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Param('subtaskId') subtaskId: string, @Body() body: UpdateSubTaskDto, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.updateSubTask(req.user.userId, projectId, taskId, subtaskId, body, socketId);
  }

  @ApiOperation({ summary: 'Delete a sub-task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Parent Task ID', example: 'uuid-here' })
  @ApiParam({ name: 'subtaskId', description: 'Sub-task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Sub-task deleted.' })
  @Delete(':taskId/subtasks/:subtaskId')
  @RequireProjectRole(Role.Member)
  async deleteSubTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Param('subtaskId') subtaskId: string, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.deleteSubTask(projectId, taskId, subtaskId, socketId);
  }

  // --- Comments ---
  @ApiOperation({ summary: 'Get all comments for a task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'List of comments.' })
  @Get(':taskId/comments')
  @RequireProjectRole(Role.Viewer)
  async getComments(@Param('taskId') taskId: string) {
    return this.taskService.getComments(taskId);
  }

  @ApiOperation({ summary: 'Create a comment on a task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 201, description: 'Comment created.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':taskId/comments')
  @RequireProjectRole(Role.Member)
  async createComment(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: CreateCommentDto, @Headers('x-socket-id') socketId?: string) {
    if (!body.body) throw new HttpException({ message: 'body is required' }, HttpStatus.BAD_REQUEST);
    return this.taskService.createComment(req.user.userId, projectId, taskId, body, socketId);
  }

  @ApiOperation({ summary: 'Delete a comment' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiParam({ name: 'commentId', description: 'Comment ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Comment deleted.' })
  @Delete(':taskId/comments/:commentId')
  @RequireProjectRole(Role.Member)
  async deleteComment(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Param('commentId') commentId: string, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.deleteComment(req.user.userId, projectId, taskId, commentId, socketId);
  }

  // --- Attachments ---
  @ApiOperation({ summary: 'Get all attachments for a task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'List of attachments.' })
  @Get(':taskId/attachments')
  @RequireProjectRole(Role.Viewer)
  async getAttachments(@Param('taskId') taskId: string) {
    return this.taskService.getAttachments(taskId);
  }

  @ApiOperation({ summary: 'Upload an attachment for a task' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Attachment uploaded.' })
  @ApiResponse({ status: 400, description: 'File required or too large' })
  @UseGuards(CustomThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':taskId/attachments')
  @RequireProjectRole(Role.Member)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-socket-id') socketId?: string
  ) {
    if (!file) throw new HttpException({ message: 'File is required' }, HttpStatus.BAD_REQUEST);
    return this.taskService.uploadAttachment(req.user.userId, taskId, slug, projectId, file, socketId);
  }

  @ApiOperation({ summary: 'Delete a task attachment' })
  @ApiParam({ name: 'slug', description: 'Workspace slug', example: 'acme-corp' })
  @ApiParam({ name: 'projectId', description: 'Project ID', example: 'uuid-here' })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'uuid-here' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID', example: 'uuid-here' })
  @ApiResponse({ status: 200, description: 'Attachment deleted.' })
  @Delete(':taskId/attachments/:attachmentId')
  @RequireProjectRole(Role.Member)
  async deleteAttachment(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('x-socket-id') socketId?: string
  ) {
    return this.taskService.deleteAttachment(req.user.userId, projectId, taskId, attachmentId, socketId);
  }
}
