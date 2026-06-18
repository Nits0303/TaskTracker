import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Req, UseGuards, UseInterceptors,
  UploadedFile, HttpException, HttpStatus, Headers
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectRoleGuard } from '../project/guards/project-role.guard';
import { RequireProjectRole } from '../project/decorators/require-project-role.decorator';
import { Role } from '@prisma/client';
import { CreateTaskSchema, UpdateTaskSchema } from '@repo/shared';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
@Controller('workspaces/:slug/projects/:projectId/tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  // --- Tasks ---
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created.' })
  @Post()
  @RequireProjectRole(Role.Member)
  async createTask(@Req() req: any, @Param('projectId') projectId: string, @Body() body: any, @Headers('x-socket-id') socketId?: string) {
    console.log('--- CREATE TASK PAYLOAD ---', body);
    const result = CreateTaskSchema.omit({ projectId: true }).safeParse(body);
    if (!result.success) {
      console.log('--- VALIDATION ERROR ---', JSON.stringify(result.error.format(), null, 2));
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.taskService.createTask(req.user.userId, projectId, result.data, socketId);
  }

  @ApiOperation({ summary: 'Get all tasks for a project' })
  @ApiResponse({ status: 200, description: 'List of tasks.' })
  @Get()
  @RequireProjectRole(Role.Viewer)
  async getTasks(@Param('projectId') projectId: string) {
    return this.taskService.getTasks(projectId);
  }

  @ApiOperation({ summary: 'Get a specific task' })
  @ApiResponse({ status: 200, description: 'Task details.' })
  @Get(':taskId')
  @RequireProjectRole(Role.Viewer)
  async getTask(@Param('taskId') taskId: string) {
    return this.taskService.getTask(taskId);
  }

  @Patch(':taskId')
  @RequireProjectRole(Role.Viewer)
  async updateTask(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: any,
    @Headers('x-socket-id') socketId?: string
  ) {
    const result = UpdateTaskSchema.omit({ projectId: true }).safeParse(body);
    if (!result.success) {
      throw new HttpException({ message: 'Validation failed', errors: result.error.format() }, HttpStatus.BAD_REQUEST);
    }
    return this.taskService.updateTask(req.user.userId, projectId, taskId, result.data, socketId);
  }

  @Patch(':taskId/reorder')
  @RequireProjectRole(Role.Member)
  async reorderTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: any, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.reorderTask(projectId, taskId, body, socketId);
  }

  @Delete(':taskId')
  @RequireProjectRole(Role.Admin)
  async deleteTask(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.deleteTask(req.user.userId, projectId, taskId, socketId);
  }

  // --- SubTasks ---
  @Post(':taskId/subtasks')
  @RequireProjectRole(Role.Member)
  async createSubTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: any, @Headers('x-socket-id') socketId?: string) {
    if (!body.title) throw new HttpException({ message: 'title is required' }, HttpStatus.BAD_REQUEST);
    return this.taskService.createSubTask(projectId, taskId, body, socketId);
  }

  @Patch(':taskId/subtasks/:subtaskId')
  @RequireProjectRole(Role.Member)
  async updateSubTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Param('subtaskId') subtaskId: string, @Body() body: any, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.updateSubTask(projectId, taskId, subtaskId, body, socketId);
  }

  @Delete(':taskId/subtasks/:subtaskId')
  @RequireProjectRole(Role.Member)
  async deleteSubTask(@Param('projectId') projectId: string, @Param('taskId') taskId: string, @Param('subtaskId') subtaskId: string, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.deleteSubTask(projectId, taskId, subtaskId, socketId);
  }

  // --- Comments ---
  @Get(':taskId/comments')
  @RequireProjectRole(Role.Viewer)
  async getComments(@Param('taskId') taskId: string) {
    return this.taskService.getComments(taskId);
  }

  @Post(':taskId/comments')
  @RequireProjectRole(Role.Member)
  async createComment(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Body() body: any, @Headers('x-socket-id') socketId?: string) {
    if (!body.body) throw new HttpException({ message: 'body is required' }, HttpStatus.BAD_REQUEST);
    return this.taskService.createComment(req.user.userId, projectId, taskId, body, socketId);
  }

  @Delete(':taskId/comments/:commentId')
  @RequireProjectRole(Role.Member)
  async deleteComment(@Req() req: any, @Param('projectId') projectId: string, @Param('taskId') taskId: string, @Param('commentId') commentId: string, @Headers('x-socket-id') socketId?: string) {
    return this.taskService.deleteComment(req.user.userId, projectId, taskId, commentId, socketId);
  }

  // --- Attachments ---
  @Get(':taskId/attachments')
  @RequireProjectRole(Role.Viewer)
  async getAttachments(@Param('taskId') taskId: string) {
    return this.taskService.getAttachments(taskId);
  }

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
