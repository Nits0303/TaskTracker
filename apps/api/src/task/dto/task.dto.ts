import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title (max 200 chars)', example: 'Update landing page design' })
  title!: string;

  @ApiPropertyOptional({ description: 'Task description (max 5000 chars)', example: 'Follow the new Figma designs for the hero section.' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Task status', example: 'Todo', enum: ['Todo', 'InProgress', 'Review', 'Completed'] })
  status?: 'Todo' | 'InProgress' | 'Review' | 'Completed';

  @ApiPropertyOptional({ description: 'Task priority', example: 'High', enum: ['Urgent', 'High', 'Medium', 'Low'] })
  priority?: 'Urgent' | 'High' | 'Medium' | 'Low';

  @ApiPropertyOptional({ description: 'Due date (ISO string)', example: '2023-12-31T23:59:59.999Z' })
  dueDate?: Date | null;

  @ApiPropertyOptional({ description: 'Start time (ISO string)', example: '2023-12-01T00:00:00.000Z' })
  startTime?: Date | null;

  @ApiPropertyOptional({ description: 'End time (ISO string)', example: '2023-12-31T23:59:59.999Z' })
  endTime?: Date | null;

  @ApiPropertyOptional({ description: 'Sorting order', example: 1000 })
  sortOrder?: number | null;

  @ApiPropertyOptional({ description: 'UUID of the assignee', example: '123e4567-e89b-12d3-a456-426614174000' })
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: 'UUID of parent task, if this is a subtask', example: '123e4567-e89b-12d3-a456-426614174000' })
  parentTaskId?: string | null;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: 'Task title', example: 'Update landing page design v2' })
  title?: string;

  @ApiPropertyOptional({ description: 'Task description', example: 'Updated description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Task status', example: 'InProgress', enum: ['Todo', 'InProgress', 'Review', 'Completed'] })
  status?: 'Todo' | 'InProgress' | 'Review' | 'Completed';

  @ApiPropertyOptional({ description: 'Task priority', example: 'Urgent', enum: ['Urgent', 'High', 'Medium', 'Low'] })
  priority?: 'Urgent' | 'High' | 'Medium' | 'Low';

  @ApiPropertyOptional({ description: 'Due date (ISO string)', example: '2023-12-31T23:59:59.999Z' })
  dueDate?: Date | null;

  @ApiPropertyOptional({ description: 'Start time (ISO string)', example: '2023-12-01T00:00:00.000Z' })
  startTime?: Date | null;

  @ApiPropertyOptional({ description: 'End time (ISO string)', example: '2023-12-31T23:59:59.999Z' })
  endTime?: Date | null;

  @ApiPropertyOptional({ description: 'UUID of the assignee', example: '123e4567-e89b-12d3-a456-426614174000' })
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: 'Optimistic locking version number', example: 1 })
  version?: number;
}

export class ReorderTaskDto {
  @ApiProperty({ description: 'New sorting order value', example: 1000 })
  sortOrder!: number;
}

export class CreateSubTaskDto {
  @ApiProperty({ description: 'Subtask title', example: 'Export assets from Figma' })
  title!: string;

  @ApiPropertyOptional({ description: 'Subtask status', example: 'Todo', enum: ['Todo', 'InProgress', 'Review', 'Completed'] })
  status?: 'Todo' | 'InProgress' | 'Review' | 'Completed';
}

export class UpdateSubTaskDto {
  @ApiPropertyOptional({ description: 'Subtask title', example: 'Export assets from Figma (updated)' })
  title?: string;

  @ApiPropertyOptional({ description: 'Subtask status', example: 'InProgress', enum: ['Todo', 'InProgress', 'Review', 'Completed'] })
  status?: 'Todo' | 'InProgress' | 'Review' | 'Completed';
}

export class CreateCommentDto {
  @ApiProperty({ description: 'Comment body (markdown allowed)', example: 'I have started working on this.' })
  body!: string;

  @ApiPropertyOptional({ description: 'UUID of the parent comment, if this is a reply', example: '123e4567-e89b-12d3-a456-426614174000' })
  parentCommentId?: string | null;
}
