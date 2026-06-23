# Sprint 25 — API Documentation (Swagger + Markdown)

## Goal
Add comprehensive API documentation in two forms — an interactive Swagger UI accessible at `/api/docs` in the browser, and a static markdown export in `docs/api/api-documentation.md`. This sprint adds `@nestjs/swagger` decorators to all existing controllers and generates both outputs from the same source.

---

## Part 1 — Install and Configure Swagger

Install in `apps/api`:

```bash
pnpm add @nestjs/swagger swagger-ui-express
```

In `apps/api/src/main.ts`, add Swagger setup before `app.listen()`:

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Task Tracker API')
  .setDescription('Complete API reference for the Task Tracker platform — a production-grade project management system built with NestJS, PostgreSQL, Redis, MinIO, and Socket.IO.')
  .setVersion('1.0')
  .addBearerAuth(
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'access-token'
  )
  .addTag('Auth', 'Authentication, registration, token refresh, Google OAuth, invites')
  .addTag('Workspaces', 'Workspace CRUD, member management, role management')
  .addTag('Projects', 'Project CRUD, project member management')
  .addTag('Tasks', 'Task CRUD, sub-tasks, comments, attachments')
  .addTag('Chat', 'Channels, messages, threads, read receipts')
  .addTag('Conversations', 'Direct messages between workspace members')
  .addTag('Calendar', 'Calendar blocks, meeting requests, availability')
  .addTag('Dashboard', 'Project and workspace statistics')
  .addTag('Workload', 'Member workload and capacity data')
  .addTag('Search', 'Full-text and trigram search across tasks, projects, members')
  .addTag('Notifications', 'In-app notifications, push subscriptions, preferences')
  .addTag('Audit Logs', 'Workspace and project audit trail')
  .addTag('Presence', 'Online status and real-time presence')
  .addTag('Health', 'System health check and dependency status')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
  customSiteTitle: 'Task Tracker API Docs',
});
```

---

## Part 2 — DTO Decorators

For every DTO class used in request bodies across all modules, add `@ApiProperty()` decorators from `@nestjs/swagger`. This is what makes Swagger show the request body schema with field names, types, and descriptions.

Apply `@ApiProperty()` to every field in every DTO. For optional fields use `@ApiPropertyOptional()`. Include:
- `description` — one sentence explaining the field
- `example` — a realistic example value
- `required` — true or false

Example for `LoginDto`:
```typescript
export class LoginDto {
  @ApiProperty({ description: 'User email address', example: 'arjun@example.com' })
  email: string;

  @ApiProperty({ description: 'User password (min 8 characters)', example: 'SecurePass123!' })
  password: string;
}
```

Apply this pattern to DTOs across all modules:
- All Auth DTOs (LoginDto, RegisterDto, InviteDto, AcceptInviteDto)
- All Workspace DTOs
- All Project DTOs
- All Task DTOs (CreateTaskDto, UpdateTaskDto, CreateCommentDto, CreateSubTaskDto)
- All Chat DTOs
- All Calendar DTOs
- All Search DTOs
- All Notification DTOs
- All Audit Log DTOs

---

## Part 3 — Controller Decorators

Add the following Swagger decorators to every controller method across all modules:

### On every controller class:
```typescript
@ApiTags('Tag Name')  // matching the tags defined in DocumentBuilder above
```

### On every controller method:
```typescript
@ApiOperation({ summary: 'Short one-line description of what this endpoint does' })
@ApiResponse({ status: 200, description: 'Success description' })
@ApiResponse({ status: 400, description: 'Validation error' })
@ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
@ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
@ApiResponse({ status: 404, description: 'Resource not found' })
@ApiResponse({ status: 429, description: 'Too many requests — rate limit exceeded' })
```

Only add the response codes that are actually relevant to each endpoint. Not every endpoint returns 404 or 403.

### On endpoints that require JWT:
```typescript
@ApiBearerAuth('access-token')
```

### On endpoints with URL parameters:
```typescript
@ApiParam({ name: 'slug', description: 'Workspace slug', example: 'task-tracker' })
@ApiParam({ name: 'projectId', description: 'Project UUID', example: 'uuid-here' })
```

### On endpoints with query parameters:
```typescript
@ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
@ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 50)', example: 20 })
```

### On file upload endpoints:
```typescript
@ApiConsumes('multipart/form-data')
@ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
```

---

## Part 4 — Complete Endpoint Coverage

Every single endpoint across every controller must be decorated. Below is the complete list of controllers to cover:

- `auth.controller.ts` — register, login, refresh, logout, google, google/callback, invite, accept-invite, reset-password
- `workspace.controller.ts` — all workspace CRUD and member management endpoints
- `project.controller.ts` — all project CRUD and member management endpoints
- `task.controller.ts` — all task CRUD, sub-task, comment, and attachment endpoints
- `chat.controller.ts` — all channel and message endpoints
- `conversation.controller.ts` — all direct message endpoints
- `calendar.controller.ts` — all calendar and meeting endpoints
- `dashboard.controller.ts` — project and workspace dashboard endpoints
- `workload.controller.ts` — project and workspace workload endpoints
- `search.controller.ts` — search endpoint
- `notification.controller.ts` — all notification endpoints
- `audit.controller.ts` — workspace and project audit log endpoints
- `user.controller.ts` — profile and avatar endpoints
- `health.controller.ts` — health check endpoint

---

## Part 5 — Markdown Export

After setting up Swagger, generate a static markdown export of the full API documentation and save it to `docs/api/api-documentation.md`.

Use the following approach in a one-time script or directly in the Swagger setup to serialize the OpenAPI JSON spec and convert it to markdown. The markdown file should have the following structure:

```markdown
# Task Tracker — API Documentation

> Generated from OpenAPI spec. Interactive version available at `http://localhost:3000/api/docs`.

## Table of Contents
- [Authentication](#authentication)
- [Workspaces](#workspaces)
- [Projects](#projects)
- [Tasks](#tasks)
- [Chat](#chat)
- [Direct Messages](#direct-messages)
- [Calendar](#calendar)
- [Dashboard](#dashboard)
- [Workload](#workload)
- [Search](#search)
- [Notifications](#notifications)
- [Audit Logs](#audit-logs)
- [Health](#health)

---

## Authentication

### POST /auth/register
**Description:** Register a new user account.  
**Auth required:** No  
**Rate limit:** 10 requests per 60 seconds  

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| fullName | string | Yes | User's full name |
| email | string | Yes | Valid email address |
| password | string | Yes | Minimum 8 characters |

**Success Response (201):**
\`\`\`json
{
  "user": { "id": "uuid", "name": "Arjun Shah", "email": "arjun@example.com" },
  "accessToken": "eyJ..."
}
\`\`\`

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error — missing or invalid fields |
| 409 | Email already registered |
| 429 | Rate limit exceeded |

---
```

Follow this exact pattern for every single endpoint. Group endpoints under their tag headings. Include request body tables, response examples with realistic data, and error response tables for every endpoint.

For endpoints with query parameters, add a query parameters table:
```markdown
**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| page | number | No | 1 | Page number |
| limit | number | No | 20 | Items per page (max 50) |
```

---

## Part 6 — Swagger UI Customization

Add the following custom CSS to make the Swagger UI match the dark theme of the application:

```typescript
SwaggerModule.setup('api/docs', app, document, {
  customCss: `
    .swagger-ui { background-color: #0a0a0a; color: #e5e5e5; }
    .swagger-ui .topbar { background-color: #111111; }
    .swagger-ui .info .title { color: #ffffff; }
    .swagger-ui .scheme-container { background-color: #1a1a1a; }
    .swagger-ui .opblock-tag { color: #e5e5e5; border-color: #333; }
    .swagger-ui .opblock.opblock-post .opblock-summary { background: rgba(73,204,144,.1); }
    .swagger-ui .opblock.opblock-get .opblock-summary { background: rgba(97,175,254,.1); }
    .swagger-ui .opblock.opblock-patch .opblock-summary { background: rgba(252,161,48,.1); }
    .swagger-ui .opblock.opblock-delete .opblock-summary { background: rgba(249,62,62,.1); }
  `,
  customSiteTitle: 'Task Tracker API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
});
```

---

## File Summary — What Changes

| File | Change |
|---|---|
| `apps/api/src/main.ts` | **Modify** — add Swagger setup |
| `apps/api/src/auth/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/workspace/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/project/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/task/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/chat/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/calendar/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/search/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/notification/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/audit/dto/*.ts` | **Modify** — add @ApiProperty decorators |
| `apps/api/src/auth/auth.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/workspace/workspace.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/project/project.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/task/task.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/chat/chat.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/chat/conversation.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/calendar/calendar.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/dashboard/dashboard.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/workload/workload.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/search/search.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/notification/notification.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/audit/audit.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/user/user.controller.ts` | **Modify** — add Swagger decorators |
| `apps/api/src/health/health.controller.ts` | **Modify** — add Swagger decorators |
| `docs/api/api-documentation.md` | **Replace placeholder** — full markdown API reference |

---

## Definition of Done

This sprint is complete when all of the following are true:

- `http://localhost:3000/api/docs` loads the Swagger UI with dark theme styling
- All 14 controller tags appear in the Swagger UI sidebar
- Every endpoint is visible in Swagger with correct method, path, and description
- Every endpoint that requires JWT shows a lock icon in Swagger
- Clicking "Authorize" in Swagger and entering a JWT token allows testing protected endpoints directly from the browser
- Every request body shows the correct fields with types, descriptions, and examples
- Every endpoint shows correct success and error response codes
- File upload endpoints show the file picker in Swagger UI
- `docs/api/api-documentation.md` contains the complete markdown reference for every endpoint
- The markdown file groups endpoints by tag with request body tables, response examples, and error tables
- No existing functionality is broken by adding decorators

---

## Notes for Antigravity

Do not change any business logic when adding decorators — decorators are metadata only and must not affect runtime behavior. The `@ApiProperty()` decorator is additive — it does not replace or conflict with existing Zod validation or class-validator decorators. If a DTO uses Zod schemas from `@repo/shared` rather than class-validator, add `@ApiProperty()` decorators directly to the DTO class fields anyway — Swagger reads them independently of the validation library. The markdown export in `docs/api/api-documentation.md` must be hand-written to match the actual endpoint behavior — do not just dump raw JSON. Use realistic example values throughout — no "string", "number" placeholders anywhere in examples.
