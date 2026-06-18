# Product Requirements Document
# Live Task Tracking System

**Version:** 1.0  
**Status:** In Progress  
**Last Updated:** June 2026

---

## 1. Product Overview

### 1.1 Product Summary
Live Task Tracking System is a production-ready, full-stack SaaS task tracking application. It is a lightweight but powerful alternative to Jira and Trello, built for small to medium teams who need real-time collaboration, structured project management, and a clean desktop-first interface.

### 1.2 Problem Statement
Existing tools like Jira are overly complex for small teams. Trello lacks structure for growing teams. Most alternatives either over-engineer the workflow or under-deliver on real-time collaboration. This product targets the gap — a tool that is as simple as Trello to start but as structured as Jira when needed, with real-time sync as a first-class feature rather than an afterthought.

### 1.3 Target Users
Production-ready SaaS targeting small to medium teams. Desktop-first experience. Users range from technical teams managing sprints to non-technical teams tracking projects.

### 1.4 Design Philosophy
Strictly dark monochromatic interface. All UI elements use only black-to-white shades. No color accents anywhere in the core design system. Typography, depth, and contrast carry the entire visual hierarchy.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) |
| Global State | Zustand |
| Server State | TanStack Query |
| Validation | Zod (shared via `@repo/shared`) |
| Real-time Client | Socket.IO client |
| Styling | Tailwind CSS (monochromatic) |
| Backend | NestJS |
| Auth | Passport.js + JWT + Google OAuth |
| ORM | Prisma |
| Database | PostgreSQL (via Docker) |
| Cache + Queue | Redis + BullMQ (via Docker) |
| File Storage | MinIO (self-hosted via Docker) |
| Monorepo | Turborepo |
| Shared Package | `@repo/shared` (Zod schemas + TypeScript types) |

---

## 3. Architecture

### 3.1 Monorepo Structure
```
root/
├── apps/
│   ├── web/          (Next.js 15 frontend)
│   └── api/          (NestJS backend)
├── packages/
│   └── shared/       (Zod schemas + shared types)
├── docker-compose.yml
└── turbo.json
```

### 3.2 Communication Pattern
- REST API for all CRUD operations
- Socket.IO WebSockets for real-time sync
- Room-based Socket.IO — users join project rooms on opening a project
- Delta updates only — only changed fields are sent over the wire, never full objects
- Redis BullMQ for activity feed event queuing
- Optimistic UI updates on the frontend with server reconciliation

### 3.3 Auth Flow
- JWT access tokens (15 minute expiry)
- Refresh tokens (7 day expiry) stored as HTTP-only cookies
- Refresh token rotation on every use — reuse detection built in
- Google OAuth via Passport Google strategy
- Team invites via signed tokens with 24 hour expiry

---

## 4. Multi-Tenancy Model

```
Workspace (organisation)
  └── Projects
        └── Tasks
              ├── Sub-tasks
              ├── Comments
              └── Attachments
```

A user can belong to multiple workspaces. Each workspace has its own member list with roles. Projects live inside workspaces. Tasks live inside projects.

---

## 5. Roles and Permissions

| Action | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Delete workspace | ✅ | ❌ | ❌ | ❌ |
| Archive workspace | ✅ | ❌ | ❌ | ❌ |
| Manage workspace members | ✅ | ✅ | ❌ | ❌ |
| Create projects | ✅ | ✅ | ❌ | ❌ |
| Delete projects | ✅ | ❌ | ❌ | ❌ |
| Archive projects | ✅ | ✅ | ❌ | ❌ |
| Manage project members | ✅ | ✅ | ❌ | ❌ |
| Create tasks | ✅ | ✅ | ✅ | ❌ |
| Edit tasks (assigned) | ✅ | ✅ | ✅ | ❌ |
| Edit tasks (any) | ✅ | ✅ | ❌ | ❌ |
| View all content | ✅ | ✅ | ✅ | ✅ |

---

## 6. Data Models

### 6.1 Core Entities
- **User** — account, profile, refresh token storage
- **Workspace** — org-level container, slug-based identity
- **WorkspaceMember** — user ↔ workspace join with role
- **Project** — lives inside workspace, has status
- **ProjectMember** — user ↔ project join with role
- **Task** — core entity, has status, priority, assignee, time slots
- **SubTask** — checklist item under a task, has own assignee and due date
- **Comment** — threaded, belongs to task
- **Attachment** — file stored in MinIO, belongs to task
- **ActivityEvent** — immutable event log, belongs to project
- **Notification** — persistent per-user notification
- **MeetingRequest** — calendar meeting request between users
- **MeetingParticipant** — user response to meeting request
- **CalendarBlock** — blocked time slot from task assignment
- **Invite** — pending workspace invite with 24h expiry token

### 6.2 Enums
- `Role`: Owner, Admin, Member, Viewer
- `TaskStatus`: Todo, InProgress, Review, Completed
- `TaskPriority`: Urgent, High, Medium, Low
- `ProjectStatus`: Active, OnHold, Completed
- `ActivityEventType`: TaskCreated, TaskUpdated, StatusChanged, TaskCompleted, CommentAdded, AttachmentAdded, MemberJoined, MemberRemoved, MeetingRequested, MeetingAccepted, MeetingDeclined
- `MeetingStatus`: Pending, Accepted, Declined, Cancelled
- `ParticipantStatus`: Pending, Accepted, Declined

---

## 7. Feature Specifications

### 7.1 Authentication
- Email and password registration with three-step onboarding flow (account → workspace setup → success)
- Login with email and password or Google OAuth
- JWT access tokens with silent refresh via HTTP-only cookie
- Token rotation — stolen refresh token reuse is detected and blocked
- Team invite flow — invite by email, 24 hour expiry link, countdown timer on accept page
- Password reset via email link
- Persistent sessions — page refresh restores session silently

### 7.2 Workspace Management
- Create workspace with name, slug, and optional logo
- Workspace switcher in sidebar for multi-workspace users
- Active workspace persists in localStorage across page refreshes
- Invite members by email with role assignment
- Change member roles
- Remove members
- Archive workspace (reversible, Owner only)
- Hard delete workspace with name confirmation (Owner only, cascade deletes everything)

### 7.3 Project Management
- Create projects inside a workspace (Owner and Admin only)
- Project card grid on workspace home with task status counts
- Project status: Active, On Hold, Completed
- Add workspace members to projects with project-level roles
- Archive project (reversible)
- Hard delete project with name confirmation
- Project shell with six-tab navigation persisting across tab switches

### 7.4 Board Page
- Kanban view with four columns: To Do, In Progress, Review, Completed
- List view as an alternative layout
- Toggle between Kanban and List view, preference remembered per project
- Drag and drop tasks between Kanban columns
- Manual reorder of cards within a column
- Column headers show task count and progress bar
- Task cards show title, priority badge, due date (red if overdue), assignee avatar
- Filters: priority, assignee, due date, label — all combinable, work across both views
- New task button always visible
- Real-time sync — other users' drag actions appear instantly via Socket.IO delta events

### 7.5 Task Management
- Create tasks with title, description, status, priority, assignee, due date, label, and time slot
- Inline editing — click any field to edit it directly
- Only assignee and Admin can edit task fields
- Task detail opens as a slide-over panel from the right side
- Four tabs inside the task panel: Info, Sub-tasks, Comments, Attachments
- Sub-tasks have their own assignee and due date
- Sub-task progress bar shown on the Info tab
- Overdue definition: past due date AND status is not Completed
- Delete task with confirmation

### 7.6 Comments
- Flat comments with threaded replies
- Show or hide reply threads with a toggle
- Real-time — new comments from other users appear instantly in the open task panel
- Comment author, timestamp, and body shown on each comment

### 7.7 File Attachments
- Upload files from the Attachments tab in the task panel
- Files stored in MinIO (self-hosted S3-compatible storage)
- Show file name, size, type icon, and download button for each attachment
- Drag and drop upload area

### 7.8 Activity Feed
- Project-scoped and workspace-wide tabs
- All members see all activity
- Event types tracked: task created, task updated, status changed, task completed, comment added, attachment added, member joined, member removed, meeting requested, meeting accepted, meeting declined
- Live updates — new events appear at the top in real time via Socket.IO
- Manual refresh button
- Filters: event type, member, date range — all combinable
- Pagination with load more button (6 events per page)
- Events routed through Redis BullMQ queue and flushed to PostgreSQL

### 7.9 Dashboard
- Scope toggle: This project vs All projects (workspace-wide)
- Role-based views:
  - Admin sees: total tasks, completed, in progress, overdue counts; member workload bars; status distribution with percentages; overdue task list
  - Member sees: their own assigned, completed, in review, overdue counts; daily activity bar chart for the week
- Activity chart counts all actions (creates, updates, comments, attachments) not just completions
- Overdue = past due date AND status not Completed

### 7.10 Calendar
- Two view modes: monthly and weekly, toggleable
- Tasks placed by due date and created date
- Color coded by status using grey shades only
- Default shows only the current user's tasks, toggleable to all project tasks
- Click empty slot to open meeting request form
- Inline quick edit on task blocks for title and due date
- Click task to open full detail panel

### 7.11 Meeting Request System
- Users can view colleague availability in a 7-day window (current day ± 3 days, scrollable week by week)
- Team availability view shows each member as a column — free (clickable) or engaged (blocked)
- Colleagues see only free or busy status, not the actual task or meeting title
- Click a free slot on a colleague's calendar to open meeting request form
- Meeting request form: title, add participants, optional agenda
- Recipients receive persistent notifications (stay until manually dismissed or acted on)
- Accept or decline from the notification
- If all accept: slot locks on everyone's calendar and shows as engaged to other colleagues
- If one declines: requester is notified, meeting stays pending not cancelled
- Task assignments with time slots auto-block the assignee's calendar
- Conflict detection warns if a requested slot overlaps an existing block

### 7.12 Members Workload Page
- Table view showing all project or workspace members
- Scope toggle: This project vs Workspace
- Filter by role
- Admin view shows: task count with load indicator (progress bar), completion rate, time slots booked, hours per week, projects list
- Member view shows: task count and time slots only — completion details hidden
- On leave flag shown as a banner at the top and a badge in the status column
- Task bar color coded by load: green under 8 tasks, amber 8–11, red 12 or more (admin view only)

### 7.13 Notifications
- In-app notification bell in the sidebar with unread count badge
- Persistent notifications for meeting requests — stay until manually dismissed
- Standard notifications for task assignments, mentions, status changes, due date reminders
- Email notifications via Resend or Nodemailer
- Browser push notifications
- All three channels toggleable per user in profile settings

### 7.14 Workspace and Project Settings
- Single page with sections layout, same pattern for both
- Workspace settings: general (name, slug, logo), members management, notification defaults, danger zone
- Project settings: general (name, description, status), members management, preferences (real-time toggle, public toggle), danger zone
- Danger zone has two actions: archive (reversible, no confirmation input needed for project) and hard delete (requires typing DELETE)
- Workspace hard delete requires typing the workspace name
- Only Owner sees workspace danger zone
- Only Project Admin and Workspace Owner see project danger zone

### 7.15 Real-Time Sync
- Users join a Socket.IO room when they open a project
- Users leave the room when they navigate away or disconnect
- Events emitted in real time: task created, task updated, task status changed, task deleted, comment added, activity event created
- Delta updates only — emit only changed fields with the task ID, not the full task object
- Optimistic UI updates on the sender's side — UI updates instantly, server confirms asynchronously
- Concurrent update conflict strategy: last-write-wins with server timestamp
- Offline reconnect handling — on reconnect fetch the latest project state to catch up on missed updates
- Offline banner shown when Socket.IO connection is lost

### 7.16 Edge Cases
- Concurrent task updates: last-write-wins with server-side timestamp comparison
- User disconnect and reconnect: fetch full project state diff on reconnect
- Invalid task or project IDs: return four hundred four with consistent JSON error shape
- Large number of tasks: virtual scrolling on list view, pagination on activity feed
- Invite token reuse: marked as used after first acceptance, returns four hundred bad request on reuse
- Refresh token reuse attack: detected via hash mismatch, stored hash cleared, user forced to re-login

---

## 8. Page and Route Map

| Route | Page | Auth Required |
|---|---|---|
| `/login` | Login | No |
| `/register` | Multi-step register | No |
| `/accept-invite` | Accept invite | No |
| `/reset-password` | Reset password | No |
| `/workspaces` | Workspace selector | Yes |
| `/w/:slug` | Workspace home (projects list) | Yes |
| `/w/:slug/members` | Workspace members | Yes |
| `/w/:slug/settings` | Workspace settings | Yes (Admin+) |
| `/w/:slug/projects/:id/board` | Board (Kanban + List) | Yes |
| `/w/:slug/projects/:id/dashboard` | Dashboard | Yes |
| `/w/:slug/projects/:id/activity` | Activity feed | Yes |
| `/w/:slug/projects/:id/calendar` | Calendar | Yes |
| `/w/:slug/projects/:id/members` | Project members workload | Yes |
| `/w/:slug/projects/:id/settings` | Project settings | Yes (Admin+) |

---

## 9. Sprint Roadmap

| Sprint | Focus | Status |
|---|---|---|
| Sprint 1 | Monorepo + dev environment setup | ✅ Complete |
| Sprint 2 | Database schema (all Prisma models and enums) | ✅ Complete |
| Sprint 3 | Auth backend (JWT + Google OAuth) | ✅ Complete |
| Sprint 4 | Auth frontend (login, register, invite pages) | ✅ Complete |
| Sprint 5 | Workspace CRUD + persistent sidebar shell | ✅ Complete |
| Sprint 6 | Project CRUD + project shell with tab navigation | ✅ Complete |
| Sprint 7 | Task CRUD (backend + frontend, no real-time) | 🔄 Pending |
| Sprint 8 | Real-time core (Socket.IO + Redis) | 🔄 Pending |
| Sprint 9 | Board page (Kanban + List + drag and drop) | 🔄 Pending |
| Sprint 10 | Task detail panel (sub-tasks, comments, attachments) | 🔄 Pending |
| Sprint 11 | Activity feed (BullMQ queue + frontend) | 🔄 Pending |
| Sprint 12 | Dashboard (stats API + frontend) | 🔄 Pending |
| Sprint 13 | Calendar + meeting requests | 🔄 Pending |
| Sprint 14 | Members workload page | 🔄 Pending |
| Sprint 15 | Notifications (in-app + email + push) | 🔄 Pending |
| Sprint 16 | Settings pages (workspace + project) | 🔄 Pending |
| Sprint 17 | Edge cases + offline handling + conflict resolution | 🔄 Pending |
| Sprint 18 | Polish + performance + final QA | 🔄 Pending |

---

## 10. Non-Functional Requirements

### 10.1 Performance
- Optimistic UI updates so interactions feel instant
- Delta updates over WebSocket — never send full objects
- Redis caching for frequently read data like project member lists
- Virtual scrolling for large task lists
- Skeleton loaders instead of spinners for page-level data fetching

### 10.2 Security
- Passwords hashed with bcrypt (salt rounds 12)
- Refresh tokens hashed before storage — never stored raw
- HTTP-only cookies for refresh tokens — inaccessible to JavaScript
- Refresh token rotation with reuse attack detection
- All environment variables via NestJS config service — never hardcoded
- Role guards on every protected endpoint — never trust client-sent role claims

### 10.3 Reliability
- Offline reconnect handling — UI shows banner and fetches state diff on reconnect
- Activity events queued via BullMQ — feed writes never block task update responses
- Consistent error response shape across all endpoints: `{ message, statusCode, timestamp }`

### 10.4 Developer Experience
- Single `pnpm dev` command starts all services
- Shared Zod schemas in `@repo/shared` — validation never duplicated between frontend and backend
- TypeScript strict mode across all apps and packages
- All secrets in `.env` files with `.env.example` documentation

---

## 11. File Storage

- Provider: MinIO (self-hosted, S3-compatible, runs in Docker)
- Files are stored with a generated storage key as the path
- Original file name, MIME type, and size are stored in the Attachment database record
- Download URLs are generated as pre-signed MinIO URLs with short expiry
- Easy to swap to AWS S3 in production by changing the endpoint configuration

---

## 12. Notification Channels

| Channel | Use Case | Toggle |
|---|---|---|
| In-app bell | All notifications | Always on |
| Email | Task assignments, due date reminders, invites, meeting requests | Per user |
| Browser push | Mentions, meeting request responses | Per user |

Meeting request notifications are persistent — they stay in the notification list until the user manually dismisses them or acts on them (accept or decline).

---

## 13. Calendar System

### Task Blocks
Created automatically when an assigner assigns a task with a start time and end time. Blocks the assignee's calendar for that slot. Other colleagues see the slot as engaged.

### Meeting Requests
- Requester views team availability in a 7-day window
- Clicks a free slot on a colleague's column
- Fills in title, additional participants, and optional agenda
- All participants receive persistent notifications
- Individual accept or decline per participant
- Slot locks on all participants' calendars only when everyone accepts
- Conflict detection prevents requesting already-blocked slots

---

## 14. Out of Scope for v1

- Mobile app
- Billing and subscription management
- Custom roles beyond the four defined
- Time tracking and logging
- Gantt chart view
- Public project sharing links
- Webhooks and third-party integrations
- Two-factor authentication
- Audit logs beyond the activity feed
