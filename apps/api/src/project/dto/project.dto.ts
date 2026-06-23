import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Project name (2-100 chars)', example: 'Website Redesign' })
  name!: string;

  @ApiPropertyOptional({ description: 'Project description', example: 'Redesigning the main corporate website' })
  description?: string | null;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ description: 'Project name', example: 'Website Redesign V2' })
  name?: string;

  @ApiPropertyOptional({ description: 'Project description', example: 'Updated description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Project status', example: 'Active', enum: ['Active', 'OnHold', 'Completed'] })
  status?: 'Active' | 'OnHold' | 'Completed';

  @ApiPropertyOptional({ description: 'Whether the project is archived', example: false })
  isArchived?: boolean;

  @ApiPropertyOptional({ description: 'Whether the project is public within the workspace', example: true })
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Whether realtime updates are enabled', example: true })
  realtimeUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Task status transition mode', example: 'Default', enum: ['Default', 'Custom'] })
  transitionMode?: 'Default' | 'Custom';

  @ApiPropertyOptional({ 
    description: 'Custom allowed transitions map (e.g., {"Todo": ["InProgress"]})', 
    example: { Todo: ['InProgress'], InProgress: ['Review'] } 
  })
  customTransitions?: Record<string, string[]> | null;
}

export class DeleteProjectDto {
  @ApiProperty({ description: 'Exact name of the project for confirmation', example: 'Website Redesign' })
  name!: string;
}

export class AddProjectMemberDto {
  @ApiProperty({ description: 'UUID of the user to add', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId!: string;

  @ApiProperty({ description: 'Role for the new project member', example: 'Member', enum: ['Admin', 'Member', 'Viewer'] })
  role!: 'Admin' | 'Member' | 'Viewer';
}

export class UpdateProjectMemberRoleDto {
  @ApiProperty({ description: 'New role for the project member', example: 'Admin', enum: ['Admin', 'Member', 'Viewer'] })
  role!: 'Admin' | 'Member' | 'Viewer';
}
