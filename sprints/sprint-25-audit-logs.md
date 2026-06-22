# Sprint 25 — Audit Logs

## Goal
Add a production-grade audit logging system to the application. Audit logs are distinct from the Activity Feed — they are security and compliance records, not UX records. By the end of this sprint every sensitive action in the application must write an immutable audit log entry synchronously to PostgreSQL, Workspace Owners and Admins must be able to view and filter these logs from a dedicated page inside the workspace shell, and the system must be lightweight enough to never slow down the actions that trigger it.

---

## Guiding Principles

Audit logs are written **synchronously and directly via Prisma** — never through BullMQ or any async queue. If the action succeeds, the audit log must exist. They are never deleted, never edited, and never cascade-deleted when related entities are removed. The Activity Feed (BullMQ, async, UX-facing) remains completely untouched — this is a separate, parallel system. Audit logs are only visible to Workspace Owner and Admin roles. Members and Viewers never see this page or these endpoints.

---

## Part 1 — Database Schema

Add the following model to `schema.prisma`. Run a migration named `add-audit-logs`.

```prisma
model AuditLog {
  id          String         @id @default(uuid())
  workspaceId String
  actorId     String?        // nullable — null for system events like brute force detection
  actorEmail  String?        // store email at time of action in case user is later removed
  actorRole   String?        // store role at time of action
  event       AuditEventType
  resourceType String?       // e.g. "Task", "Project", "Workspace", "Member"
  resourceId  String?        // ID of the affected entity
  resourceName String?       // human-readable name at time of action e.g. project name
  metadata    Json?          // additional context e.g. old role, new role, IP address
  ipAddress   String?
  createdAt   DateTime       @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  actor       User?     @relation(fields: [actorId], references: [id])

  @@index([workspaceId, createdAt])
  @@index([workspaceId, event])
}
```

Add the following enum to `schema.prisma`:

```prisma
enum AuditEventType {
  // Auth
  LOGIN_SUCCESS
  LOGOUT
  BRUTE_FORCE_DETECTED

  // Member Management
  MEMBER_INVITED
  MEMBER_REMOVED
  MEMBER_ROLE_CHANGED

  // Workspace
  WORKSPACE_CREATED
  WORKSPACE_UPDATED
  WORKSPACE_ARCHIVED
  WORKSPACE_DELETED

  // Project
  PROJECT_CREATED
  PROJECT_UPDATED
  PROJECT_ARCHIVED
  PROJECT_DELETED

  // Project Member
  PROJECT_MEMBER_ADDED
  PROJECT_MEMBER_REMOVED
  PROJECT_MEMBER_ROLE_CHANGED

  // Settings
  WORKSPACE_SETTINGS_CHANGED
  PROJECT_SETTINGS_CHANGED

  // Rate Limiting
  RATE_LIMIT_VIOLATION
}
```

**Important:** Add `@@index([workspaceId, createdAt])` and `@@index([workspaceId, event])` as shown above. These two indexes are mandatory — audit log queries always filter by workspace and either sort by date or filter by event type. Without these indexes the queries will do full table scans as the log grows.

**Important:** The `AuditLog` model must have **no cascade delete rules**. Even if the workspace, actor, or related resource is deleted, audit log entries must remain in the database permanently. Use `onDelete: NoAction` or simply do not define an `onDelete` clause, defaulting to restrict — then handle this by using `actorId` as nullable and storing `actorEmail` and `actorRole` as denormalized string snapshots at write time.

---

## Part 2 — Audit Log Service

Create `apps/api/src/audit/audit.service.ts` and `apps/api/src/audit/audit.module.ts`.

The `AuditLogService` has a single public method:

```typescript
async log(payload: {
  workspaceId: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  event: AuditEventType;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void>
```

This method writes directly to the `AuditLog` table via Prisma. It must never throw — wrap the Prisma write in a try/catch and log any write failure using `Logger.error` with context `'AuditLog'`. A failed audit log write must never crash or roll back the parent action — it must fail silently after logging the error to the file logger.

Export `AuditLogService` from `AuditModule`. Import `AuditModule` into every module that needs it: `AuthModule`, `WorkspaceModule`, `ProjectModule`, `RealtimeModule`.

---

## Part 3 — Wiring Audit Log Calls

Call `auditLogService.log()` after each of the following actions succeed. All calls are `await`ed inside a try/catch as described above. Extract the IP address from `req.ip` in controllers and pass it through to the service call.

### `auth.controller.ts` / `auth.service.ts`

**LOGIN_SUCCESS** — after successful login or Google OAuth callback. Actor is the authenticated user. No resource.

**LOGOUT** — after successful logout. Actor is the authenticated user.

**BRUTE_FORCE_DETECTED** — this is a special case. In the `CustomThrottlerGuard` built in Sprint 25, when `throwThrottlingException` is called and the violated endpoint is `/auth/login`, additionally call `auditLogService.log()` with event `BRUTE_FORCE_DETECTED`, `actorId: null`, `actorEmail` set to whatever email was in the request body if available, `ipAddress` from the request, and `metadata: { endpoint: '/auth/login' }`. The `workspaceId` is not applicable here — use a sentinel value or make `workspaceId` nullable in the model for this specific case. Update the schema if needed to allow nullable `workspaceId` only for this event type, handled via a model-level check or simply by making the field nullable in Prisma.

### `workspace.controller.ts` / `workspace.service.ts`

- **WORKSPACE_CREATED** — resourceId and resourceName are the new workspace's id and name.
- **WORKSPACE_UPDATED** — metadata includes which fields changed.
- **WORKSPACE_ARCHIVED** — resourceId and resourceName are the workspace.
- **WORKSPACE_DELETED** — log this **before** the delete executes, since after deletion the workspace record no longer exists to reference. Store the name in resourceName.
- **MEMBER_INVITED** — resourceType: "User", metadata includes invited email and assigned role.
- **MEMBER_REMOVED** — resourceType: "User", resourceId is the removed user's ID, metadata includes their former role.
- **MEMBER_ROLE_CHANGED** — metadata includes userId, oldRole, newRole.
- **WORKSPACE_SETTINGS_CHANGED** — metadata includes which settings section was changed.

### `project.controller.ts` / `project.service.ts`

- **PROJECT_CREATED** — resourceId and resourceName are the new project.
- **PROJECT_UPDATED** — metadata includes changed fields.
- **PROJECT_ARCHIVED** — resourceId and resourceName are the project.
- **PROJECT_DELETED** — log **before** the delete executes.
- **PROJECT_MEMBER_ADDED** — metadata includes userId and assigned role.
- **PROJECT_MEMBER_REMOVED** — metadata includes userId and former role.
- **PROJECT_MEMBER_ROLE_CHANGED** — metadata includes userId, oldRole, newRole.
- **PROJECT_SETTINGS_CHANGED** — metadata includes which settings section was changed.

### `custom-throttler.guard.ts` (Sprint 25)

- **RATE_LIMIT_VIOLATION** — when any rate limit is exceeded on any endpoint. `workspaceId` may not be available in guard context — make it nullable in the schema for this event too. metadata includes endpoint, userId or IP, and timestamp. This is in addition to the existing `Logger.warn` file log from Sprint 25 — both must fire.

---

## Part 4 — Audit Log Endpoints

Create `apps/api/src/audit/audit.controller.ts`.

### GET /workspaces/:slug/audit-logs

Protected by JWT auth guard. Only Workspace Owner and Admin may call this — enforce with the existing `WorkspaceRoleGuard` requiring Admin role minimum.

**Query parameters:**
- `page` — defaults to 1
- `limit` — defaults to 20, hard maximum of 50
- `event` — optional, comma-separated list of `AuditEventType` values to filter by
- `actorId` — optional, filter by a specific actor user ID
- `from` — optional ISO date string, filter logs created after this date
- `to` — optional ISO date string, filter logs created before this date. Default `to` to 90 days ago as the earliest queryable date — do not return logs older than 90 days from this endpoint even if they exist in the database.

**Response shape:**
```json
{
  "data": [
    {
      "id": "uuid",
      "event": "MEMBER_ROLE_CHANGED",
      "actorName": "Arjun S.",
      "actorEmail": "arjun@example.com",
      "actorRole": "Admin",
      "resourceType": "Member",
      "resourceId": "uuid",
      "resourceName": "Priya M.",
      "metadata": { "oldRole": "Member", "newRole": "Admin" },
      "ipAddress": "192.168.1.1",
      "createdAt": "2024-06-10T12:00:00.000Z"
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 20
}
```

Order results by `createdAt` descending — newest first.

Join the `actor` relation to get the actor's current name for display, but always show `actorEmail` from the denormalized field on the log row itself in case the user was later deleted.

---

## Part 5 — Frontend: Audit Logs Page

Add **Audit Logs** as a new navigation item in the workspace sidebar, below Settings, visible only to Workspace Owner and Admin roles. It should use the same sidebar nav item style as existing items. Route: `/w/:slug/audit-logs`.

This page renders inside the existing workspace sidebar shell layout — no new layout file needed.

### Page Header
A heading "Audit Logs" on the left. A small subtitle in tertiary grey: "Security and compliance records for this workspace — last 90 days." On the right a manual refresh icon button that re-fetches the current page.

### Filter Bar
A single row of filters below the header:
- **Event type** — a multi-select dropdown listing all `AuditEventType` values grouped by category (Auth, Member Management, Workspace, Project, Rate Limiting). Shows selected count as a badge.
- **Actor** — a dropdown listing all workspace members by name. Selecting one filters to that actor's actions.
- **Date range** — From and To date pickers. Default to last 7 days on initial load.
- **Clear all** button that resets all filters and re-fetches.

### Audit Log Table
A full-width table with sticky header. Columns:

| Column | Content |
|---|---|
| Timestamp | Formatted as `Jun 10, 2024 · 12:00 PM`. Relative time on hover via tooltip. |
| Actor | Avatar initials + name. "System" for null actor events like BRUTE_FORCE_DETECTED. |
| Event | The event type rendered as a human-readable label. e.g. `MEMBER_ROLE_CHANGED` → "Role Changed". Use a small monochromatic badge. |
| Resource | ResourceType + ResourceName. e.g. "Project · API Redesign". Empty if not applicable. |
| Details | A collapsed summary from metadata. e.g. "Admin → Owner" for role changes. Click to expand full metadata as a small code block in tertiary grey monospace font. |
| IP Address | Raw IP string in tertiary grey. |

### Pagination
Standard page-based pagination controls at the bottom. Previous and Next buttons. Current page indicator. Show total count: "Showing 1–20 of 142 entries."

### Empty State
If no logs match the current filters show a centered empty state: an icon and "No audit log entries match your filters." with a clear filters button.

### Loading State
Skeleton rows while data is in flight — same shimmer pattern used on the dashboard and members pages.

### Access Control
If a Member or Viewer somehow navigates to `/w/:slug/audit-logs`, redirect them to the workspace home with a toast saying they do not have permission.

---

## Part 6 — Schema Update for Nullable workspaceId

Update the `AuditLog` model to make `workspaceId` nullable:

```prisma
workspaceId String?
workspace   Workspace? @relation(fields: [workspaceId], references: [id])
```

This allows `BRUTE_FORCE_DETECTED` and `RATE_LIMIT_VIOLATION` events to be written without a workspace context. These events are still queryable from individual workspace audit log endpoints by filtering on `workspaceId IS NOT NULL` — they simply won't appear in any workspace's audit log UI, which is acceptable since they are infrastructure-level events visible via the file logger from Sprint 25.

---

## File Summary — What Changes

| File | Change |
|---|---|
| `schema.prisma` | **Modify** — add `AuditLog` model, `AuditEventType` enum, nullable workspaceId |
| `prisma/migrations/` | **New** — migration named `add-audit-logs` |
| `apps/api/src/audit/audit.module.ts` | **New** |
| `apps/api/src/audit/audit.service.ts` | **New** |
| `apps/api/src/audit/audit.controller.ts` | **New** |
| `apps/api/src/auth/auth.service.ts` | **Modify** — add LOGIN_SUCCESS, LOGOUT calls |
| `apps/api/src/common/guards/custom-throttler.guard.ts` | **Modify** — add BRUTE_FORCE_DETECTED and RATE_LIMIT_VIOLATION calls |
| `apps/api/src/workspace/workspace.service.ts` | **Modify** — add all workspace audit calls |
| `apps/api/src/project/project.service.ts` | **Modify** — add all project audit calls |
| `apps/api/src/app.module.ts` | **Modify** — import AuditModule |
| `apps/web/src/app/w/[slug]/audit-logs/page.tsx` | **New** — audit logs page |
| `apps/web/src/components/audit/AuditLogTable.tsx` | **New** — table component |
| `apps/web/src/components/audit/AuditLogFilters.tsx` | **New** — filter bar component |

---

## Definition of Done

This sprint is complete when all of the following are true:

- The `add-audit-logs` migration runs cleanly with the correct indexes and nullable workspaceId
- `AuditLogService.log()` never throws and never crashes the parent action on failure
- All events listed in Part 3 write correctly to the audit log table after their respective actions succeed
- WORKSPACE_DELETED and PROJECT_DELETED are logged before the delete executes
- BRUTE_FORCE_DETECTED is logged when the login rate limit is exceeded, with null actorId and the targeted email in metadata
- RATE_LIMIT_VIOLATION is logged for all other rate limit hits in addition to the file log from Sprint 25
- GET /workspaces/:slug/audit-logs is accessible only to Owner and Admin roles
- The 90-day query cap is enforced on the backend regardless of what date range the client sends
- The audit logs page renders correctly with filters, table, pagination, and empty/loading states
- Audit log entries are never deleted even when related workspace, project, or user records are deleted
- No colors outside the black-to-white range appear anywhere in the audit logs UI
- The sidebar nav item for Audit Logs is hidden from Member and Viewer roles

---

## Notes for Antigravity

Do not route audit log writes through BullMQ under any circumstances — every write is synchronous and direct via Prisma. Do not add cascade delete rules to the AuditLog model. Always store actorEmail and actorRole as denormalized string snapshots on the log row at write time — never rely on joining to the User table to show who performed an action, since users can be removed. The 90-day cap is a query-level restriction on the endpoint only — the data in the database is never deleted or purged by this sprint. Do not build any data retention or purge job. The frontend audit log page is read-only — no mutations are possible from the UI.
