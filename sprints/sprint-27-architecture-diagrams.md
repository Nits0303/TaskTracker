# Sprint 25 — Architecture Diagrams

## Goal
Create a dedicated `docs/` folder at the monorepo root containing all architecture diagrams as Mermaid-based markdown files. Every diagram must be written using Mermaid syntax inside fenced code blocks so they render as visual diagrams natively on GitHub and in any Mermaid-compatible viewer. No external image files, no PNG exports — Mermaid code blocks are the source of truth.

---

## Folder Structure to Create

```
docs/
├── architecture/
│   ├── er-diagram.md
│   ├── system-architecture.md
│   └── sequence-diagrams.md
├── api/
│   └── api-documentation.md  ← this is for the next sprint, leave empty for now
└── README.md
```

Create all folders and files. Leave `api/api-documentation.md` as an empty placeholder with just a heading "# API Documentation — Coming Soon".

---

## File 1 — `docs/README.md`

A clean index file linking to all documentation. Content:

```markdown
# Task Tracker — Documentation

## Architecture
- [ER Diagram](./architecture/er-diagram.md) — Database schema split by domain
- [System Architecture](./architecture/system-architecture.md) — Full stack component diagram with Docker layer
- [Sequence Diagrams](./architecture/sequence-diagrams.md) — Four major workflow walkthroughs

## API
- [API Documentation](./api/api-documentation.md) — Complete endpoint reference
```

---

## File 2 — `docs/architecture/er-diagram.md`

### Heading and Introduction
```markdown
# Entity Relationship Diagrams

The database schema is split into seven domain-specific diagrams for clarity. 
All diagrams use Mermaid `erDiagram` syntax. Primary keys are marked `PK`, 
foreign keys are marked `FK`, and nullable fields are marked with a `?` suffix.
```

### Domain 1 — Auth & Users
Include these models with all their fields: `User`, `Invite`, `NotificationPreference`, `PushSubscription`.

Show relationships:
- User has one NotificationPreference
- User has one PushSubscription
- Invite references no User directly (stores email as string)

### Domain 2 — Workspace & Members
Include: `Workspace`, `WorkspaceMember`.

Show relationships:
- Workspace has many WorkspaceMembers
- WorkspaceMember belongs to User and Workspace
- Include the `Role` enum values as a comment above the diagram

### Domain 3 — Projects & Members
Include: `Project`, `ProjectMember`.

Show relationships:
- Project belongs to Workspace
- ProjectMember joins User and Project
- Include `ProjectStatus` enum values as a comment

### Domain 4 — Tasks
Include: `Task`, `SubTask`, `Comment`, `Attachment`, `CalendarBlock`.

Show relationships:
- Task belongs to Project
- Task has optional self-relation for parent task (sub-tasks via self-reference)
- SubTask belongs to Task
- Comment belongs to Task and User, has optional self-relation for replies
- Attachment belongs to Task and User
- CalendarBlock belongs to Task and User
- Include `TaskStatus` and `TaskPriority` enum values as comments

### Domain 5 — Chat
Include: `Channel`, `ChannelMember`, `Message`, `MessageAttachment`, `ChannelMute`, `ProjectChatMute`.

Show relationships:
- Channel belongs to optional Project and Workspace
- Channel has type field (CHANNEL or DIRECT)
- ChannelMember joins User and Channel, stores lastReadMessageId
- Message belongs to Channel and User, has optional self-relation for thread replies
- MessageAttachment belongs to Message
- ChannelMute belongs to User and Channel
- ProjectChatMute belongs to User and Project

### Domain 6 — Meetings & Calendar
Include: `MeetingRequest`, `MeetingParticipant`.

Show relationships:
- MeetingRequest belongs to Workspace and requester User
- MeetingParticipant joins MeetingRequest and User
- Include `MeetingStatus` and `ParticipantStatus` enum values as comments

### Domain 7 — System
Include: `ActivityEvent`, `Notification`, `AuditLog`.

Show relationships:
- ActivityEvent belongs to Project and optional Task and actor User
- Notification belongs to recipient User
- AuditLog belongs to optional Workspace and optional actor User
- Include `ActivityEventType` and `AuditEventType` enum values as comments

---

## File 3 — `docs/architecture/system-architecture.md`

### Heading and Introduction
```markdown
# System Architecture

A full-stack view of the Task Tracker platform showing all components, 
their communication patterns, and how they are containerized in Docker.
```

### Diagram 1 — Component Architecture
Use Mermaid `graph TD` to show the following layers top to bottom:

```
Browser (Next.js 15)
    │
    ├── REST API calls (Axios + JWT Bearer)
    ├── WebSocket connection (Socket.IO client)
    │
NestJS API Server
    │
    ├── Auth Module (JWT + Google OAuth + Passport)
    ├── Workspace Module
    ├── Project Module  
    ├── Task Module
    ├── Chat Module
    ├── Calendar Module
    ├── Search Module (PostgreSQL Full-Text + Trigram)
    ├── Dashboard Module
    ├── Notification Module
    ├── Activity Module (BullMQ Producer)
    ├── Audit Log Module
    ├── Health Module (@nestjs/terminus)
    └── Realtime Gateway (Socket.IO Server)
            │
            ├── PostgreSQL (Prisma ORM)
            ├── Redis (ioredis)
            │     ├── Socket.IO Adapter
            │     ├── BullMQ Queue Storage
            │     ├── Rate Limiting Storage
            │     ├── Presence TTL Keys
            │     └── Dashboard Cache
            ├── MinIO (File Storage)
            └── BullMQ Workers
                  ├── Activity Feed Worker
                  └── Notification Worker
                        ├── In-App (Socket.IO emit)
                        ├── Email (Nodemailer/SMTP)
                        └── Push (web-push/VAPID)
```

### Diagram 2 — Docker Container Architecture
Use Mermaid `graph LR` to show the Docker Compose setup:

Show the following containers on the same Docker network:
- `web` container — Next.js 15, port 3000
- `api` container — NestJS, port 3001, has Docker healthcheck on `/health`
- `postgres` container — PostgreSQL, port 5433 (remapped locally)
- `redis` container — Redis, port 6380 (remapped locally)
- `minio` container — MinIO, API port 9000, Console port 9001

Show which containers talk to which:
- `web` → `api` (HTTP + WebSocket)
- `api` → `postgres`, `redis`, `minio`
- `api` healthcheck → itself on `/health`

Add a note showing the shared Docker network name.

### Diagram 3 — Real-Time Event Flow
Use Mermaid `graph LR` to show how a real-time event flows from action to all connected clients:

```
User Action (e.g. drag task to new column)
    → Frontend optimistic update (Zustand store)
    → REST API call (PATCH /tasks/:id)
    → NestJS Task Service
    → Prisma write to PostgreSQL
    → Activity Queue (BullMQ)
    → RealtimeGateway.emitToProject()
    → Redis pub/sub (Socket.IO adapter)
    → All connected clients in project room
    → Each client's Zustand store updated
    → UI re-renders
```

---

## File 4 — `docs/architecture/sequence-diagrams.md`

### Heading
```markdown
# Sequence Diagrams

Four major workflows documented as step-by-step sequence diagrams.
All diagrams use Mermaid `sequenceDiagram` syntax.
```

---

### Sequence 1 — Login + Token Refresh Flow

Reuse and expand the existing sequence diagrams from `architecture_login.md`. That file already contains two Mermaid sequence diagrams:
1. Token Generation Flow (login)
2. Token Refresh Flow (Axios interceptor)

Reuse both exactly as written in that file. Expand with a third diagram showing the **Google OAuth flow**:

Participants: `Browser`, `Next.js`, `NestJS AuthController`, `Google OAuth`, `Database`

Steps:
1. User clicks "Continue with Google"
2. Next.js redirects to `GET /auth/google`
3. NestJS redirects to Google OAuth consent screen
4. User grants permission
5. Google redirects to `GET /auth/google/callback` with profile
6. NestJS checks if user exists by email
7a. If exists → generate tokens, rotate refresh token in DB
7b. If not exists → create user with googleAuth: true, generate tokens
8. NestJS redirects to frontend `/workspaces?token=<accessToken>`
9. Next.js stores accessToken in Zustand, refresh token already set as HttpOnly cookie

---

### Sequence 2 — Real-Time Task Update via Socket.IO

Participants: `UserA Browser`, `UserB Browser`, `Next.js`, `NestJS TaskController`, `NestJS RealtimeGateway`, `Redis`, `PostgreSQL`

Steps:
1. UserA opens project board → `useProjectRoom` hook emits `project:join`
2. UserB opens same project board → emits `project:join`
3. Both sockets added to room `project:${projectId}` in Redis
4. UserA edits task title inline
5. Zustand store updated optimistically (instant UI)
6. Axios sends `PATCH /tasks/:taskId` with changed fields
7. NestJS TaskController validates JWT and project membership
8. Prisma writes update to PostgreSQL
9. AuditLogService.log() writes TASK_DESCRIPTION_CHANGED synchronously
10. ActivityService.logEvent() pushes job to BullMQ queue (fire and forget)
11. RealtimeGateway.emitToProject() called with `task:updated` event and delta payload
12. Redis pub/sub broadcasts to all sockets in project room
13. UserB's socket receives `task:updated`
14. UserB's Zustand store merges delta update
15. UserB's UI re-renders with updated task title

---

### Sequence 3 — Meeting Request + Accept Flow

Participants: `Requester Browser`, `Participant Browser`, `NestJS CalendarController`, `NestJS NotificationService`, `BullMQ`, `PostgreSQL`, `Redis`, `Socket.IO`

Steps:
1. Requester opens Team Availability view in Calendar tab
2. Frontend fetches `GET /calendar/team` — returns busy/free slots per member
3. Requester clicks a free slot on Participant's column
4. Meeting request form opens pre-filled with time slot
5. Requester fills title, agenda, submits
6. `POST /meetings` called
7. NestJS checks for conflicts — queries CalendarBlock and MeetingParticipant for overlapping slots
8. No conflict → MeetingRequest created in PostgreSQL with status Pending
9. MeetingParticipant record created for each participant with status Pending
10. Persistent Notification record created for each participant
11. NotificationService.dispatch() called (fire and forget) → BullMQ job queued
12. RealtimeGateway emits `meeting:requested` to each participant's personal room `user:${userId}`
13. Participant's browser receives `meeting:requested` via Socket.IO
14. Notification bell badge increments in real time
15. Participant opens notification bell → sees "Requires action" card
16. Participant clicks Accept
17. `PATCH /meetings/:meetingId/respond` called with `{ response: "Accepted" }`
18. MeetingParticipant record updated to Accepted
19. NestJS checks if ALL participants have accepted
20. All accepted → MeetingRequest status updated to Accepted
21. CalendarBlock created for every participant
22. RealtimeGateway emits `meeting:accepted` to all participants' personal rooms
23. All participants' calendars update in real time showing confirmed meeting block

---

### Sequence 4 — File Upload to MinIO

Participants: `Browser`, `Next.js`, `NestJS TaskController`, `MinIO`, `PostgreSQL`

Steps:
1. User opens Attachments tab in task detail panel
2. User drags file onto upload zone or clicks to select file
3. Frontend creates FormData with the file
4. XHR request sent to `POST /tasks/:taskId/attachments` with multipart/form-data
5. Frontend tracks upload progress via XHR `upload.onprogress` event
6. Progress bar fills in the UI as bytes are uploaded
7. NestJS receives multipart stream via Multer
8. NestJS streams file directly to MinIO (never buffers entire file in memory)
9. MinIO stores file under path `workspaceSlug/projectId/taskId/filename`
10. MinIO returns storage confirmation
11. NestJS creates Attachment record in PostgreSQL with: originalFileName, storageKey, fileSize, mimeType, uploaderUserId, taskId
12. NestJS generates pre-signed MinIO download URL (1 hour expiry)
13. NestJS returns created Attachment object with download URL
14. Frontend receives response, removes progress bar
15. New attachment row appears in the list with file name, size, uploader, and download button
16. AuditLogService.log() writes ATTACHMENT_UPLOADED
17. ActivityService.logEvent() pushes AttachmentAdded job to BullMQ

---

## Definition of Done

This sprint is complete when all of the following are true:

- `docs/` folder exists at monorepo root with the correct structure
- `docs/README.md` links to all four files correctly
- `er-diagram.md` contains seven separate Mermaid erDiagram blocks, one per domain, each with correct fields and relationships
- `system-architecture.md` contains three Mermaid diagrams — component architecture, Docker container architecture, and real-time event flow
- `sequence-diagrams.md` contains four Mermaid sequenceDiagram blocks — login+OAuth, real-time task update, meeting request+accept, file upload
- All Mermaid diagrams render correctly — test by pasting each into https://mermaid.live to verify no syntax errors
- The login and token refresh sequence diagrams are reused from `architecture_login.md` without modification
- `docs/api/api-documentation.md` exists as a placeholder with a heading only
- No diagram contains placeholder text, lorem ipsum, or TODO comments — every diagram is complete and accurate

---

## Notes for Antigravity

Do not generate PNG, SVG, or any binary image files — Mermaid code blocks inside markdown are the deliverable. Do not install any diagram generation library. Every Mermaid diagram must be syntactically valid — verify each one mentally before writing it. The ER diagrams must reflect the actual current Prisma schema including all fields added across all sprints including `lastSeenAt` on User, `onLeave` on WorkspaceMember, `reminderSent` on Task, `mentions` on Message, and `AuditLog`. The sequence diagrams must reflect the actual implementation — reference the correct endpoint paths, event names, and service method names as they exist in the codebase.
