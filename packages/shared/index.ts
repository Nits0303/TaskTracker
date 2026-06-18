import { z } from 'zod';

// Shared Enums (mirroring Prisma)
export const RoleEnum = z.enum(['Owner', 'Admin', 'Member', 'Viewer']);
export const TaskStatusEnum = z.enum(['Todo', 'InProgress', 'Review', 'Completed']);
export const TaskPriorityEnum = z.enum(['Urgent', 'High', 'Medium', 'Low']);
export const ProjectStatusEnum = z.enum(['Active', 'OnHold', 'Completed']);
export const TransitionModeEnum = z.enum(['Default', 'Custom']);

// Workspace Schemas
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(2, 'Workspace name must be at least 2 characters').max(50, 'Workspace name cannot exceed 50 characters'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, digits, and hyphens'),
  logoUrl: z.string().url().optional().nullable(),
}).strict();

export const UpdateWorkspaceSchema = CreateWorkspaceSchema.partial().extend({
  isArchived: z.boolean().optional(),
  isInviteOnly: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
}).strict();

// Project Schemas
export const CreateProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').max(100, 'Project name cannot exceed 100 characters'),
  description: z.string().optional().nullable(),
  workspaceId: z.string().uuid('Invalid workspace ID'),
}).strict();

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  status: ProjectStatusEnum.optional(),
  isArchived: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  realtimeUpdates: z.boolean().optional(),
  transitionMode: TransitionModeEnum.optional(),
  customTransitions: z.record(z.string(), z.array(TaskStatusEnum)).optional().nullable(),
}).strict();

// Task Schemas
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(200, 'Task title cannot exceed 200 characters'),
  description: z.string().max(5000, 'Task description cannot exceed 5000 characters').optional().nullable(),
  status: TaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  dueDate: z.coerce.date().optional().nullable(),
  startTime: z.coerce.date().optional().nullable(),
  endTime: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().optional().nullable(),
  projectId: z.string().uuid('Invalid project ID'),
  assigneeId: z.string().uuid('Invalid assignee ID').optional().nullable(),
  parentTaskId: z.string().uuid('Invalid parent task ID').optional().nullable(),
}).strict();

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  version: z.number().int().optional(),
}).strict();

// Comment Schemas
export const CreateCommentSchema = z.object({
  body: z.string().min(1, 'Comment body is required').max(10000, 'Comment body cannot exceed 10000 characters'),
  taskId: z.string().uuid('Invalid task ID'),
  parentCommentId: z.string().uuid('Invalid parent comment ID').optional().nullable(),
}).strict();

export const UpdateCommentSchema = CreateCommentSchema.partial().strict();

// Auth Schemas
export const RegisterSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(255),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
}).strict();

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
}).strict();

export const InviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: RoleEnum,
  workspaceId: z.string().uuid('Invalid workspace ID'),
}).strict();

export const AcceptInviteSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  fullName: z.string().min(1, 'Full name is required').max(255).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
}).strict();

export const ALLOWED_STATUS_TRANSITIONS = {
  Todo: ['InProgress'],
  InProgress: ['Todo', 'Review'],
  Review: ['InProgress', 'Completed'],
  Completed: ['Review'],
};


