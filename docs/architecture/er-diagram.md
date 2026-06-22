# Entity Relationship Diagrams

The database schema is split into seven domain-specific diagrams for clarity. 
All diagrams use Mermaid `erDiagram` syntax. Primary keys are marked `PK`, 
foreign keys are marked `FK`, and nullable fields are marked with a `?` suffix.

## Domain 1 — Auth & Users

```mermaid
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
        String password?
        String avatarUrl?
        Boolean isGoogleAuth
        String refreshToken?
        Boolean emailVerified
        DateTime lastSeenAt?
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
        Boolean inAppCalendarEvents
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
erDiagram
    Workspace ||--o{ WorkspaceMember : has
    User ||--o{ WorkspaceMember : belongs_to
    Workspace {
        String id PK
        String name
        String slug
        String logoUrl?
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
        String description?
        ProjectStatus status
        Boolean isArchived
        Boolean isPublic
        Boolean realtimeUpdates
        TransitionMode transitionMode
        Json customTransitions?
        String workspaceId FK
        DateTime createdAt
        DateTime updatedAt
        Unsupported searchVector?
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
erDiagram
    Project ||--o{ Task : has
    Task ||--o{ Task : subtasks
    Task ||--o{ SubTask : has
    Task ||--o{ Comment : has
    User ||--o{ Comment : author
    Comment ||--o{ Comment : replies
    Task ||--o{ Attachment : has
    User ||--o{ Attachment : uploader
    Task ||--o{ CalendarBlock : has
    User ||--o{ CalendarBlock : user
    Project {
        String id PK
    }
    User {
        String id PK
    }
    Task {
        String id PK
        String title
        String description?
        TaskStatus status
        TaskPriority priority
        DateTime dueDate?
        DateTime startTime?
        DateTime endTime?
        Int sortOrder?
        String label?
        String projectId FK
        String assigneeId? FK
        String parentTaskId? FK
        Boolean reminderSent
        Int version
        DateTime createdAt
        DateTime updatedAt
        Unsupported searchVector?
    }
    SubTask {
        String id PK
        String title
        Boolean isDone
        String assigneeId? FK
        DateTime dueDate?
        String description?
        String parentTaskId FK
        DateTime createdAt
        DateTime updatedAt
        Unsupported searchVector?
    }
    Comment {
        String id PK
        String body
        String taskId FK
        String authorId FK
        String parentCommentId? FK
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
    CalendarBlock {
        String id PK
        String userId FK
        String taskId? FK
        String meetingRequestId? FK
        DateTime startDatetime
        DateTime endDatetime
        String label
        String description?
        DateTime createdAt
        DateTime updatedAt
    }
```

## Domain 5 — Chat

```mermaid
%% ChannelType enum: Project, Direct
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
        String description?
        Boolean isPrivate
        ChannelType type
        String workspaceId FK
        String projectId? FK
        String participant1Id?
        String participant2Id?
        String creatorId FK
        DateTime createdAt
        DateTime updatedAt
    }
    ChannelMember {
        String id PK
        String userId FK
        String channelId FK
        DateTime joinedAt
        String lastReadMessageId? FK
    }
    Message {
        String id PK
        String body
        Boolean isEdited
        Boolean isDeleted
        String channelId FK
        String authorId FK
        String parentMessageId? FK
        Json mentions?
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
        DateTime mutedUntil?
        DateTime createdAt
        DateTime updatedAt
    }
    ProjectChatMute {
        String id PK
        String userId FK
        String projectId FK
        DateTime mutedUntil?
        DateTime createdAt
        DateTime updatedAt
    }
```

## Domain 6 — Meetings & Calendar

```mermaid
%% MeetingStatus enum: Pending, Accepted, Declined, Cancelled
%% ParticipantStatus enum: Pending, Accepted, Declined
erDiagram
    Workspace ||--o{ MeetingRequest : has
    Project ||--o{ MeetingRequest : has
    User ||--o{ MeetingRequest : requester
    MeetingRequest ||--o{ MeetingParticipant : has
    User ||--o{ MeetingParticipant : user
    Workspace { String id PK }
    Project { String id PK }
    User { String id PK }
    MeetingRequest {
        String id PK
        String requesterId FK
        String workspaceId FK
        String projectId? FK
        String title
        String agenda?
        DateTime startDatetime
        DateTime endDatetime
        MeetingStatus status
        DateTime createdAt
        DateTime updatedAt
    }
    MeetingParticipant {
        String id PK
        String meetingRequestId FK
        String userId FK
        ParticipantStatus status
        DateTime respondedAt?
        DateTime createdAt
        DateTime updatedAt
    }
```

## Domain 7 — System

```mermaid
%% ActivityEventType enum: TaskCreated, TaskUpdated, StatusChanged, TaskCompleted, CommentAdded, AttachmentAdded, MemberJoined, MemberRemoved, MeetingRequested, MeetingAccepted, MeetingDeclined
%% AuditEventType enum: LOGIN_SUCCESS, LOGOUT, BRUTE_FORCE_DETECTED, RATE_LIMIT_VIOLATION, WORKSPACE_CREATED, WORKSPACE_UPDATED, WORKSPACE_ARCHIVED, WORKSPACE_DELETED, WORKSPACE_SETTINGS_CHANGED, WORKSPACE_MEMBER_INVITED, WORKSPACE_MEMBER_REMOVED, WORKSPACE_MEMBER_ROLE_CHANGED, PROJECT_CREATED, PROJECT_ARCHIVED, PROJECT_DELETED, PROJECT_MEMBER_ADDED, PROJECT_MEMBER_REMOVED, TASK_CREATED, TASK_DELETED, TASK_STATUS_CHANGED, TASK_ASSIGNEE_CHANGED, TASK_DESCRIPTION_CHANGED, TASK_DUE_DATE_CHANGED, SUBTASK_CREATED, SUBTASK_ASSIGNED, COMMENT_ADDED, COMMENT_DELETED_BY_ADMIN, ATTACHMENT_UPLOADED, ATTACHMENT_DELETED, MEETING_REQUESTED, PROJECT_SETTINGS_CHANGED, PROJECT_MEMBER_ROLE_CHANGED
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
        String taskId? FK
        Json metadata?
        DateTime createdAt
    }
    Notification {
        String id PK
        String recipientId FK
        String type
        String message
        Boolean isRead
        Boolean isDismissed
        String referenceId?
        DateTime createdAt
    }
    AuditLog {
        String id PK
        String workspaceId? FK
        String actorId? FK
        String actorEmail?
        String actorRole?
        AuditEventType event
        String resourceType?
        String resourceId?
        String resourceName?
        Json metadata?
        String ipAddress?
        DateTime createdAt
    }
```
