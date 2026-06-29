# Sequence Diagrams

Four major workflows documented as step-by-step sequence diagrams.
All diagrams use Mermaid `sequenceDiagram` syntax.

## Login + Token Refresh Flow

### Token Generation Flow (Login)
```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#3b82f6', 'actorTextColor': '#fff', 'activationBkgColor': '#8b5cf6', 'textColor': '#fff', 'signalTextColor': '#fff', 'noteTextColor': '#fff', 'messageTextColor': '#fff'}}}%%
sequenceDiagram
    participant User
    participant Browser
    participant API
    participant DB as Database

    User->>Browser: Enters email and password
    Browser->>API: POST /auth/login {email, password}
    API->>DB: Find user by email
    DB-->>API: User details + hashed password
    API->>API: Verify bcrypt password
    API->>API: Generate Access Token (JWT)
    API->>API: Generate Refresh Token
    API->>DB: Store hashed Refresh Token
    API-->>Browser: { accessToken }, Set-Cookie: refreshToken (HttpOnly)
    Browser->>Browser: Store accessToken in Zustand
```

### Token Refresh Flow (Axios interceptor)
```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#3b82f6', 'actorTextColor': '#fff', 'activationBkgColor': '#8b5cf6', 'textColor': '#fff', 'signalTextColor': '#fff', 'noteTextColor': '#fff', 'messageTextColor': '#fff'}}}%%
sequenceDiagram
    participant Browser
    participant API
    participant DB as Database

    Browser->>API: GET /users/me (Bearer <expired_token>)
    API-->>Browser: 401 Unauthorized

    Note over Browser: Axios response interceptor catches 401

    Browser->>API: POST /auth/refresh (Cookie: refreshToken)
    API->>DB: Verify Refresh Token against stored hash
    DB-->>API: Valid
    API->>API: Generate new Access Token
    API->>API: Generate new Refresh Token (Rotation)
    API->>DB: Update stored Refresh Token
    API-->>Browser: { accessToken }, Set-Cookie: refreshToken (HttpOnly)

    Note over Browser: Interceptor updates Zustand and replays original request

    Browser->>API: GET /users/me (Bearer <new_token>)
    API-->>Browser: 200 OK
```

### Google OAuth Flow
```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#3b82f6', 'actorTextColor': '#fff', 'activationBkgColor': '#8b5cf6', 'textColor': '#fff', 'signalTextColor': '#fff', 'noteTextColor': '#fff', 'messageTextColor': '#fff'}}}%%
sequenceDiagram
    participant Browser
    participant Next as Next.js
    participant Auth as NestJS AuthController
    participant Google as Google OAuth
    participant DB as Database

    Browser->>Next: User clicks "Continue with Google"
    Next->>Auth: Redirects to GET /auth/google
    Auth->>Google: Redirects to Google OAuth consent screen
    Google-->>Browser: User grants permission
    Browser->>Auth: Redirects to GET /auth/google/callback with profile
    Auth->>DB: NestJS checks if user exists by email
    alt If exists
        Auth->>Auth: Generate tokens
        Auth->>DB: Rotate refresh token in DB
    else If not exists
        Auth->>DB: Create user with googleAuth: true
        Auth->>Auth: Generate tokens
        Auth->>DB: Store refresh token in DB
    end
    Auth->>Next: Redirects to frontend /workspaces?token=<accessToken>
    Next->>Next: Store accessToken in Zustand, refresh token already set as HttpOnly cookie
```

## Real-Time Task Update via Socket.IO

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#3b82f6', 'actorTextColor': '#fff', 'activationBkgColor': '#8b5cf6', 'textColor': '#fff', 'signalTextColor': '#fff', 'noteTextColor': '#fff', 'messageTextColor': '#fff'}}}%%
sequenceDiagram
    participant UA as UserA Browser
    participant UB as UserB Browser
    participant Next as Next.js
    participant TaskCtrl as NestJS TaskController
    participant Gateway as NestJS RealtimeGateway
    participant Redis as Redis
    participant DB as PostgreSQL

    UA->>Gateway: useProjectRoom emits 'project:join'
    UB->>Gateway: useProjectRoom emits 'project:join'
    Gateway->>Redis: Both sockets added to room project:{projectId}
    UA->>UA: UserA edits task title inline
    UA->>UA: Zustand store updated optimistically (instant UI)
    UA->>TaskCtrl: PATCH /tasks/:taskId with changed fields
    TaskCtrl->>TaskCtrl: Validates JWT and project membership
    TaskCtrl->>DB: Prisma writes update to PostgreSQL
    TaskCtrl->>DB: AuditLogService.log() writes TASK_DESCRIPTION_CHANGED synchronously
    TaskCtrl->>Redis: ActivityService.logEvent() pushes job to BullMQ queue (fire and forget)
    TaskCtrl->>Gateway: RealtimeGateway.emitToProject() called with task:updated event and delta payload
    Gateway->>Redis: Redis pub/sub broadcasts to all sockets in project room
    Redis-->>UB: UserB's socket receives task:updated
    UB->>UB: UserB's Zustand store merges delta update
    UB->>UB: UserB's UI re-renders with updated task title
```


## File Upload to MinIO

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'actorBkg': '#3b82f6', 'actorTextColor': '#fff', 'activationBkgColor': '#8b5cf6', 'textColor': '#fff', 'signalTextColor': '#fff', 'noteTextColor': '#fff', 'messageTextColor': '#fff'}}}%%
sequenceDiagram
    participant Browser
    participant Next as Next.js
    participant Ctrl as NestJS TaskController
    participant MinIO as MinIO
    participant DB as PostgreSQL

    Browser->>Browser: User opens Attachments tab in task detail panel
    Browser->>Browser: User drags file onto upload zone or clicks to select file
    Browser->>Next: Frontend creates FormData with the file
    Next->>Ctrl: XHR request sent to POST /tasks/:taskId/attachments with multipart/form-data
    Note over Next: Frontend tracks upload progress via XHR upload.onprogress event
    Next->>Next: Progress bar fills in the UI as bytes are uploaded
    Ctrl->>Ctrl: NestJS receives multipart stream via Multer
    Ctrl->>MinIO: NestJS streams file directly to MinIO (never buffers entire file in memory)
    MinIO-->>Ctrl: MinIO returns storage confirmation
    Ctrl->>DB: Creates Attachment record in PostgreSQL with: originalFileName, storageKey, fileSize, mimeType, uploaderUserId, taskId
    Ctrl->>MinIO: NestJS generates pre-signed MinIO download URL (1 hour expiry)
    MinIO-->>Ctrl: Returns pre-signed URL
    Ctrl-->>Next: NestJS returns created Attachment object with download URL
    Next->>Next: Frontend receives response, removes progress bar
    Next->>Browser: New attachment row appears in the list with file name, size, uploader, and download button
    Ctrl->>DB: AuditLogService.log() writes ATTACHMENT_UPLOADED
    Ctrl->>MinIO: ActivityService.logEvent() pushes AttachmentAdded job to BullMQ
```
