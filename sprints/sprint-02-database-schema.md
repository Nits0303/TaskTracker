# Sprint 2 — Database Schema + Prisma Models

## Goal
Define the complete PostgreSQL database schema via Prisma models. Every entity the application will ever need must be modelled here. No backend logic, no API endpoints, no frontend work. Just a clean, well-thought-out schema that future sprints will build on top of.

---

## Guiding Principles

Every model should have a `createdAt` and `updatedAt` timestamp. Use UUIDs as primary keys everywhere, not auto-incrementing integers. All relations should be explicit with proper foreign keys and cascade rules defined. Think carefully about what gets deleted when a parent is deleted versus what gets soft-deleted.

---

## Models to Define

### User
Represents a person who has an account in the system. Store their full name, email address, hashed password, avatar URL, and a flag indicating whether they signed up via Google OAuth. Also store a refresh token field that will hold their current valid refresh token — this will be used during token rotation in Sprint 3. Add a field for whether the user has verified their email. Add a `createdAt` and `updatedAt`. A user can belong to many workspaces and many projects through join tables.

### Workspace
Represents an organisation or team space. Store the workspace name, a unique slug, a logo URL, and whether the workspace is archived. A workspace has one owner who is a User. A workspace has many members through a join table. A workspace has many projects. When a workspace is deleted, all its projects and everything inside them should be cascade deleted.

### WorkspaceMember
This is the join table between User and Workspace. Store the user ID, workspace ID, and the role of that user in that workspace. The role must be one of four values: Owner, Admin, Member, Viewer. Store a `joinedAt` timestamp. The combination of user ID and workspace ID should be unique.

### Project
Represents a project inside a workspace. Store the project name, description, status (Active, OnHold, Completed), and whether the project is archived. A project belongs to one workspace. A project has many members through a join table. A project has many tasks. Store `createdAt` and `updatedAt`.

### ProjectMember
Join table between User and Project. Store user ID, project ID, and role (same four values as WorkspaceMember). The combination of user ID and project ID must be unique.

### Task
This is the core entity. Store the title, description, status (Todo, InProgress, Review, Completed), priority (Urgent, High, Medium, Low), due date as a nullable datetime, start time as a nullable datetime, end time as a nullable datetime (these two are for calendar time slot blocking), and a nullable integer for manual sort order within a column. A task belongs to one project. A task has one optional assignee who is a User. A task has one optional parent task for sub-tasks — this is a self-relation. A task has many comments, many attachments, and many activity events. When a task is deleted, cascade delete all its comments, attachments, and activity events. Store `createdAt` and `updatedAt`.

### SubTask
Represents a checklist item under a task. Store the title, a boolean for whether it is done, an optional assignee user ID, and an optional due date. Belongs to one parent task. Store `createdAt` and `updatedAt`. When the parent task is deleted, cascade delete all sub-tasks.

### Comment
Belongs to one task and one author (User). Store the comment body as text. Support threading by having an optional parent comment ID — this is a self-relation for replies. Store `createdAt` and `updatedAt`. Cascade delete when the parent task is deleted.

### Attachment
Belongs to one task and one uploader (User). Store the original file name, the storage key (the path in MinIO), the file size in bytes, and the MIME type. Store `createdAt`. Cascade delete when the parent task is deleted.

### ActivityEvent
Represents a single event in the activity feed. Store the event type as an enum with the following values: TaskCreated, TaskUpdated, StatusChanged, TaskCompleted, CommentAdded, AttachmentAdded, MemberJoined, MemberRemoved, MeetingRequested, MeetingAccepted, MeetingDeclined. Store the actor user ID (who did the action), the project ID it belongs to, an optional task ID if the event is task-related, and a JSON metadata field for storing additional context like old and new status values. Store `createdAt`. This model should never be updated, only created. Cascade delete when the parent project is deleted.

### Notification
Represents a persistent notification for a user. Store the recipient user ID, the type of notification as a string, the message body, a boolean for whether it has been read, a boolean for whether it has been dismissed (dismissed notifications stay in the database but are hidden from the UI), and an optional reference ID that points to the related entity (task, meeting request, etc.). Store `createdAt`. These are never cascade deleted — they stay even if the related entity is deleted.

### MeetingRequest
Represents a calendar meeting request from one user to others. Store the requester user ID, the workspace ID, a title, an optional agenda text, the proposed start datetime, the proposed end datetime, and the overall status of the request as an enum: Pending, Accepted, Declined, Cancelled. Store `createdAt` and `updatedAt`.

### MeetingParticipant
Join table between MeetingRequest and User. Store the meeting request ID, the user ID, and that participant's individual response status as an enum: Pending, Accepted, Declined. The combination of meeting request ID and user ID must be unique. Store `respondedAt` as a nullable datetime.

### CalendarBlock
Represents a blocked time slot on a user's calendar that was created by a task assignment with a time slot. Store the user ID, the task ID, the start datetime, the end datetime, and a label. When the task is deleted, cascade delete the calendar block.

### Invite
Represents a pending team invite sent to an email address. Store the email being invited, the workspace ID, the role being assigned, the token (a unique random string used in the invite link), whether the invite has been used, and an `expiresAt` datetime. Store `createdAt`.

---

## Enums to Define

Define the following Prisma enums so they are enforced at the database level:

- `Role` with values: Owner, Admin, Member, Viewer
- `TaskStatus` with values: Todo, InProgress, Review, Completed
- `TaskPriority` with values: Urgent, High, Medium, Low
- `ProjectStatus` with values: Active, OnHold, Completed
- `ActivityEventType` with values: TaskCreated, TaskUpdated, StatusChanged, TaskCompleted, CommentAdded, AttachmentAdded, MemberJoined, MemberRemoved, MeetingRequested, MeetingAccepted, MeetingDeclined
- `MeetingStatus` with values: Pending, Accepted, Declined, Cancelled
- `ParticipantStatus` with values: Pending, Accepted, Declined

---

## Shared Package — Zod Schemas

After defining the Prisma models, go to `packages/shared` and create Zod schemas that mirror the core entities. Create schemas for creating a task, updating a task, creating a project, updating a project, creating a workspace, and updating a workspace. These schemas should validate the same fields and constraints that the Prisma models enforce. Export all of them from the shared package's `index.ts`. Both the frontend and backend will import these same schemas for validation — this ensures the validation logic is never duplicated.

---

## Migrations

Run `prisma migrate dev` with a migration name of `init` to generate and apply the initial migration. Confirm that all tables are created in the PostgreSQL instance running in Docker. Run `prisma generate` to regenerate the Prisma client with all the new models.

---

## Definition of Done

This sprint is complete when all of the following are true:

- All models listed above exist in `schema.prisma` with correct field types, relations, and cascade rules
- All enums are defined in the schema
- `prisma migrate dev --name init` runs successfully with no errors
- All tables are visible in the PostgreSQL database
- Prisma client is regenerated and all models are importable in the NestJS app without TypeScript errors
- Zod schemas for the core create and update operations are exported from `@repo/shared`
- No API endpoints or UI changes in this sprint

---

## Notes for Antigravity

Do not create any API endpoints, services, or controllers in this sprint. The only files that should change are `schema.prisma`, the shared package Zod schemas, and the migration files generated by Prisma. If you notice a relation that seems missing or a field that seems incomplete, add it now — fixing the schema after Sprint 3 onwards becomes increasingly costly. Think of this sprint as pouring the concrete foundation. It must be right before anything is built on top.
