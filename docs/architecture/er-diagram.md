# Entity Relationship Diagrams

The database schema is split into seven domain-specific diagrams for clarity. 
All diagrams use Mermaid `%%{init: {'theme': 'dark'}}%%
erDiagram` syntax. Primary keys are marked `PK`, 
foreign keys are marked `FK`, and nullable fields are marked with a `?` suffix.

## Domain 1 — Auth & Users

```mermaid
%%{init: {'theme': 'dark'}}%%
erDiagram
    User ||--o| NotificationPreference : has
    User ||--o| PushSubscription : has
    Invite {
        String id PK
        String email
        String workspaceId FK
        Role role
        String token
        Boolean isUsed
        DateTime expiresAt
        DateTime createdAt
    }
    User {
        String id PK
        String fullName
        String email
        String password "nullable"
        String avatarUrl "nullable"
        Boolean isGoogleAuth
        String refreshToken "nullable"
        Boolean emailVerified
        DateTime lastSeenAt "nullable"
        DateTime createdAt
        DateTime updatedAt
    }
    NotificationPreference {
        String id PK
        String userId FK
        Boolean emailEnabled
        Boolean pushEnabled
        Boolean emailTaskAssignments
        Boolean emailMentions
        Boolean emailTaskDeadlines
        Boolean inAppTaskAssignments
        Boolean inAppMentions
        Boolean inAppTaskDeadlines
        Boolean inAppTaskUpdates
        Boolean inAppMemberJoined
        Boolean inAppDirectMessages
        DateTime createdAt
        DateTime updatedAt
    }
    PushSubscription {
        String id PK
        String userId FK
        String endpoint
        String auth
        String p256dh
        DateTime createdAt
        DateTime updatedAt
    }
```

## Domain 2 — Workspace & Members

```mermaid
%% Role enum: Owner, Admin, Member, Viewer
%%{init: {'theme': 'dark'}}%%
erDiagram
    Workspace ||--o{ WorkspaceMember : has
    User ||--o{ WorkspaceMember : belongs_to
    Workspace {
        String id PK
        String name
        String slug
        String logoUrl "nullable"
        Boolean isArchived
        Boolean isInviteOnly
        Boolean emailNotifications
        String ownerId FK
        DateTime createdAt
        DateTime updatedAt
    }
    WorkspaceMember {
        String id PK
        String userId FK
        String workspaceId FK
        Role role
        Boolean onLeave
        DateTime joinedAt
        DateTime createdAt
        DateTime updatedAt
    }
    User {
        String id PK
    }
```

## Domain 3 — Projects & Members

```mermaid
%% ProjectStatus enum: Active, OnHold, Completed
%% TransitionMode enum: Default, Custom
%%{init: {'theme': 'dark'}}%%
erDiagram
    Workspace ||--o{ Project : has
    Project ||--o{ ProjectMember : has
    User ||--o{ ProjectMember : belongs_to
    Workspace {
        String id PK
    }
    User {
        String id PK
    }
    Project {
        String id PK
        String name
        String description "nullable"
        ProjectStatus status
        Boolean isArchived
        Boolean isPublic
        Boolean realtimeUpdates
        TransitionMode transitionMode
        Json customTransitions "nullable"
        String workspaceId FK
        DateTime createdAt
        DateTime updatedAt
        Unsupported searchVector "nullable"
    }
    ProjectMember {
        String id PK
        String userId FK
        String projectId FK
        Role role
        DateTime joinedAt
        DateTime createdAt
        DateTime updatedAt
    }
```

## Domain 4 — Tasks

```mermaid
%% TaskStatus enum: Todo, InProgress, Review, Completed
%% TaskPriority enum: Urgent, High, Medium, Low
%%{init: {'theme': 'dark'}}%%
erDiagram
    Project ||--o{ Task : has
    Task ||--o{ Task : subtasks
    Task ||--o{ SubTask : has
    Task ||--o{ Comment : has
    User ||--o{ Comment : author
    Comment ||--o{ Comment : replies
    Task ||--o{ Attachment : has
    User ||--o{ Attachment : uploader
    Project {
        String id PK
    }
    User {
        String id PK
    }
    Task {
        String id PK
        String title
        String description "nullable"
        TaskStatus status
        TaskPriority priority
        DateTime dueDate "nullable"
        DateTime startTime "nullable"
        DateTime endTime "nullable"
        Int sortOrder "nullable"
        String label "nullable"
        String projectId FK
        String assigneeId FK "nullable"
        String parentTaskId FK "nullable"
        Boolean reminderSent
        Int version
        DateTime createdAt
        DateTime updatedAt
        Unsupported searchVector "nullable"
    }
    SubTask {
        String id PK
        String title
        Boolean isDone
        String assigneeId FK "nullable"
        DateTime dueDate "nullable"
        String description "nullable"
        String parentTaskId FK
        DateTime createdAt
        DateTime updatedAt
        Unsupported searchVector "nullable"
    }
    Comment {
        String id PK
        String body
        String taskId FK
        String authorId FK
        String parentCommentId FK "nullable"
        DateTime createdAt
        DateTime updatedAt
    }
    Attachment {
        String id PK
        String fileName
        String storageKey
        Int fileSize
        String mimeType
        String taskId FK
        String uploaderId FK
        DateTime createdAt
    }

```

## Domain 5 — Chat

```mermaid
%% ChannelType enum: Project, Direct
%%{init: {'theme': 'dark'}}%%
erDiagram
    Workspace ||--o{ Channel : has
    Project ||--o{ Channel : has
    User ||--o{ Channel : creator
    Channel ||--o{ ChannelMember : has
    User ||--o{ ChannelMember : user
    Channel ||--o{ Message : has
    User ||--o{ Message : author
    Message ||--o{ Message : replies
    Message ||--o{ MessageAttachment : has
    User ||--o{ MessageAttachment : uploader
    Channel ||--o{ ChannelMute : has
    User ||--o{ ChannelMute : user
    Project ||--o{ ProjectChatMute : has
    User ||--o{ ProjectChatMute : user
    Workspace { String id PK }
    Project { String id PK }
    User { String id PK }
    Channel {
        String id PK
        String name
        String description "nullable"
        Boolean isPrivate
        ChannelType type
        String workspaceId FK
        String projectId FK "nullable"
        String participant1Id "nullable"
        String participant2Id "nullable"
        String creatorId FK
        DateTime createdAt
        DateTime updatedAt
    }
    ChannelMember {
        String id PK
        String userId FK
        String channelId FK
        DateTime joinedAt
        String lastReadMessageId FK "nullable"
    }
    Message {
        String id PK
        String body
        Boolean isEdited
        Boolean isDeleted
        String channelId FK
        String authorId FK
        String parentMessageId FK "nullable"
        Json mentions "nullable"
        DateTime createdAt
        DateTime updatedAt
    }
    MessageAttachment {
        String id PK
        String fileName
        String storageKey
        Int fileSize
        String mimeType
        String messageId FK
        String uploaderId FK
        DateTime createdAt
    }
    ChannelMute {
        String id PK
        String userId FK
        String channelId FK
        DateTime mutedUntil "nullable"
        DateTime createdAt
        DateTime updatedAt
    }
    ProjectChatMute {
        String id PK
        String userId FK
        String projectId FK
        DateTime mutedUntil "nullable"
        DateTime createdAt
        DateTime updatedAt
    }
```

## Domain 7 — System

```mermaid
%% ActivityEventType enum: TaskCreated, TaskUpdated, StatusChanged, TaskCompleted, CommentAdded, AttachmentAdded, MemberJoined, MemberRemoved
%% AuditEventType enum: LOGIN_SUCCESS, LOGOUT, BRUTE_FORCE_DETECTED, RATE_LIMIT_VIOLATION, WORKSPACE_CREATED, WORKSPACE_UPDATED, WORKSPACE_ARCHIVED, WORKSPACE_DELETED, WORKSPACE_SETTINGS_CHANGED, WORKSPACE_MEMBER_INVITED, WORKSPACE_MEMBER_REMOVED, WORKSPACE_MEMBER_ROLE_CHANGED, PROJECT_CREATED, PROJECT_ARCHIVED, PROJECT_DELETED, PROJECT_MEMBER_ADDED, PROJECT_MEMBER_REMOVED, TASK_CREATED, TASK_DELETED, TASK_STATUS_CHANGED, TASK_ASSIGNEE_CHANGED, TASK_DESCRIPTION_CHANGED, TASK_DUE_DATE_CHANGED, SUBTASK_CREATED, SUBTASK_ASSIGNED, COMMENT_ADDED, COMMENT_DELETED_BY_ADMIN, ATTACHMENT_UPLOADED, ATTACHMENT_DELETED, PROJECT_SETTINGS_CHANGED, PROJECT_MEMBER_ROLE_CHANGED
%%{init: {'theme': 'dark'}}%%
erDiagram
    Project ||--o{ ActivityEvent : has
    Task ||--o{ ActivityEvent : has
    User ||--o{ Notification : recipient
    Workspace ||--o{ AuditLog : has
    User ||--o{ AuditLog : actor
    Project { String id PK }
    Task { String id PK }
    User { String id PK }
    Workspace { String id PK }
    ActivityEvent {
        String id PK
        ActivityEventType eventType
        String actorId FK
        String projectId FK
        String taskId FK "nullable"
        Json metadata "nullable"
        DateTime createdAt
    }
    Notification {
        String id PK
        String recipientId FK
        String type
        String message
        Boolean isRead
        Boolean isDismissed
        String referenceId "nullable"
        DateTime createdAt
    }
    AuditLog {
        String id PK
        String workspaceId FK "nullable"
        String actorId FK "nullable"
        String actorEmail "nullable"
        String actorRole "nullable"
        AuditEventType event
        String resourceType "nullable"
        String resourceId "nullable"
        String resourceName "nullable"
        Json metadata "nullable"
        String ipAddress "nullable"
        DateTime createdAt
    }
```
