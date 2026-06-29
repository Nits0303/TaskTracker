# Task Tracker — API Documentation

> Generated from OpenAPI spec. Interactive version available at `http://localhost:3000/api/docs`.

## Table of Contents
- [Audit Logs](#audit-logs)
- [Auth](#auth)
- [Chat](#chat)
- [Conversations](#conversations)
- [Dashboard](#dashboard)
- [Health Check](#health-check)
- [Notifications](#notifications)
- [Projects](#projects)
- [Search](#search)
- [Tasks](#tasks)
- [Users](#users)
- [Workload](#workload)
- [Workspaces](#workspaces)
- [activity](#activity)
- [app](#app)

---

## Audit Logs

### GET /workspaces/:slug/audit-logs
**Description:** Get workspace audit logs
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| page | string | No | - |
| limit | string | No | - |
| event | string | No | - |
| actorId | string | No | - |
| from | string | No | - |
| to | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Auth

### POST /auth/register
**Description:** Register a new user
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | User full name |
| string | string | Yes | User password (min 6 characters) |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### POST /auth/login
**Description:** Log in and receive tokens
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Valid email address |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |
| 401 | Invalid credentials |

---

### POST /auth/refresh
**Description:** Refresh access token
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /auth/logout
**Description:** Log out user
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 401 | Unauthorized — missing or invalid JWT |

---

### GET /auth/google
**Description:** Initiates Google OAuth flow
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Error Responses:**
| Code | Description |
|---|---|
| 302 | Redirects to Google consent screen |

---

### GET /auth/google/callback
**Description:** Google OAuth callback handler
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Error Responses:**
| Code | Description |
|---|---|
| 302 | Redirects to frontend with access token |

---

### POST /auth/invite
**Description:** Create an invite for a workspace
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Email address to invite |
| string | string | Yes | UUID of the workspace |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |
| 401 | Unauthorized — missing or invalid JWT |

---

### GET /auth/invite/:token
**Description:** Get details of an invite
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 404 | Invite not found |

---

### POST /auth/accept-invite
**Description:** Accept an invite and join workspace
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Invite token received via email |
| string | string | No | Password (required if new user) |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### POST /auth/forgot-password
**Description:** Request a password reset email
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Valid email address |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### POST /auth/reset-password
**Description:** Reset password using token
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Reset token received via email |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

## Chat

### POST /workspaces/:slug/projects/:projectId/channels
**Description:** Create a new chat channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Name of the channel |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### GET /workspaces/:slug/projects/:projectId/channels
**Description:** Get all channels in a project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/channels/:channelId
**Description:** Get details of a specific channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/projects/:projectId/channels/:channelId
**Description:** Update a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Name of the channel |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/projects/:projectId/channels/:channelId/members
**Description:** Add a member to a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | UUID of the user to add to the channel |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId/members/:userId
**Description:** Remove a member from a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId
**Description:** Delete a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Exact name of the channel for confirmation |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/channels/:channelId/messages
**Description:** Get messages for a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| before | string | No | - |
| limit | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId/thread
**Description:** Get thread messages
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| before | string | No | - |
| limit | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/projects/:projectId/channels/:channelId/messages
**Description:** Create a message in a channel
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Content of the message |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId
**Description:** Update a message
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Updated content of the message |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId
**Description:** Delete a message
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId/attachments
**Description:** Upload an attachment to a message
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Success Response (201):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/projects/:projectId/channels/:channelId/read
**Description:** Mark a message as read
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | ID of the last read message |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId/seen-by
**Description:** Get list of users who have read a message
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/projects/:projectId/channels/channels/:channelId/mute
**Description:** Mute a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Mute duration string (e.g.  |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/channels/channels/:channelId/mute
**Description:** Unmute a channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/projects/:projectId/channels/chat/mute
**Description:** Mute all project chat
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Mute duration string (e.g.  |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/channels/chat/mute
**Description:** Unmute all project chat
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/channels/chat/mute-status
**Description:** Get mute status for a project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Conversations

### GET /workspaces/:slug/conversations
**Description:** Get all direct conversations in a workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/conversations/messages
**Description:** Create a direct message
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Channel ID (if existing conversation) |
| string | string | Yes | Content of the message |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### GET /workspaces/:slug/conversations/:channelId/messages
**Description:** Get messages for a conversation channel
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| before | string | No | - |
| limit | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/conversations/:channelId/read
**Description:** Mark a direct message as read
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | ID of the last read message |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/conversations/:channelId/messages/:messageId/attachments
**Description:** Upload an attachment to a direct message
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Success Response (201):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/conversations/:channelId/messages/:messageId/seen-by
**Description:** Get list of users who have read a direct message
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/conversations/:channelId/messages/:messageId
**Description:** Delete a direct message
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/conversations/:channelId/messages/:messageId
**Description:** Update a direct message
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Updated content of the message |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Dashboard

### GET /workspaces/:slug/projects/:projectId/dashboard
**Description:** Get project dashboard statistics
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/dashboard
**Description:** Get workspace dashboard statistics
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Health Check

### GET 
**Description:** Get application health status
**Auth required:** No
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 503 | Service is unhealthy. |

---

## Notifications

### GET /notifications
**Description:** Get recent notifications for the current user
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| limit | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /notifications/:id/read
**Description:** Mark a notification as read
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /notifications/read-all
**Description:** Mark all notifications as read
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /notifications/:id
**Description:** Dismiss a notification
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /notifications/push-subscription
**Description:** Save push notification subscription
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Push service endpoint URL |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

---

### DELETE /notifications/push-subscription
**Description:** Remove push notification subscription
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /notifications/preferences
**Description:** Get current user notification preferences
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /notifications/preferences
**Description:** Update notification preferences
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| boolean | boolean | No | Enable/disable all email notifications |
| boolean | boolean | No | Email notifications for task assignments |
| boolean | boolean | No | Email notifications for task deadlines |
| boolean | boolean | No | In-app notifications for mentions |
| boolean | boolean | No | In-app notifications for task updates |
| boolean | string | No | In-app notifications for direct messages |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Projects

### POST /workspaces/:slug/projects
**Description:** Create a new project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Project name (2-100 chars) |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### GET /workspaces/:slug/projects
**Description:** Get all projects in workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId
**Description:** Get a specific project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 404 | Project not found |

---

### PATCH /workspaces/:slug/projects/:projectId
**Description:** Update project details
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Project name |
| status | string | No | Project status |
| boolean | boolean | No | Whether the project is archived |
| boolean | string | No | Whether realtime updates are enabled |
| example | string[] | No | Custom allowed transitions map (e.g., { |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |
| 403 | Forbidden — insufficient role |

---

### PATCH /workspaces/:slug/projects/:projectId/archive
**Description:** Archive a project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### GET /workspaces/:slug/projects/:projectId/audit-logs
**Description:** Get project audit logs
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| page | string | No | - |
| limit | string | No | - |
| event | string | No | - |
| actorId | string | No | - |
| from | string | No | - |
| to | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId
**Description:** Delete a project permanently
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Exact name of the project for confirmation |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error - name mismatch |
| 403 | Forbidden — insufficient role |

---

### GET /workspaces/:slug/projects/:projectId/members
**Description:** Get all members of a project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/projects/:projectId/members
**Description:** Add a user to a project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | UUID of the user to add |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### PATCH /workspaces/:slug/projects/:projectId/members/:userId/role
**Description:** Update a project member role
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| role | string | Yes | New role for the project member |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### DELETE /workspaces/:slug/projects/:projectId/members/:userId
**Description:** Remove a member from the project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

## Search

### GET /workspaces/:slug/search
**Description:** Search across workspace or project
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Query Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| q | string | Yes | - |
| scope | string | No | - |
| projectId | string | No | - |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Tasks

### POST /workspaces/:slug/projects/:projectId/tasks
**Description:** Create a new task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Task title (max 200 chars) |
| status | string | No | Task status |
| priority | string | No | Task priority |
| Date | string | No | Due date (ISO string) |
| Date | string | No | Start time (ISO string) |
| Date | string | No | End time (ISO string) |
| number | string | No | Sorting order |
| string | string | No | UUID of the assignee |
| string | string | No | UUID of parent task, if this is a subtask |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### GET /workspaces/:slug/projects/:projectId/tasks
**Description:** Get all tasks for a project
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/tasks/:taskId
**Description:** Get a specific task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 404 | Task not found |

---

### PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId
**Description:** Update a specific task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |
| 404 | Task not found |

---

### PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId/reorder
**Description:** Reorder a task (change sortOrder)
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| number | string | Yes | New sorting order value |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId
**Description:** Delete a specific task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### POST /workspaces/:slug/projects/:projectId/tasks/:taskId/subtasks
**Description:** Create a sub-task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Subtask title |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId/subtasks/:subtaskId
**Description:** Update a sub-task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Subtask title |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId/subtasks/:subtaskId
**Description:** Delete a sub-task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/tasks/:taskId/comments
**Description:** Get all comments for a task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/projects/:projectId/tasks/:taskId/comments
**Description:** Create a comment on a task
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Comment body (markdown allowed) |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId/comments/:commentId
**Description:** Delete a comment
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/projects/:projectId/tasks/:taskId/attachments
**Description:** Get all attachments for a task
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### POST /workspaces/:slug/projects/:projectId/tasks/:taskId/attachments
**Description:** Upload an attachment for a task
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | File required or too large |

---

### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId/attachments/:attachmentId
**Description:** Delete a task attachment
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Users

### GET /users/me
**Description:** Get current user profile
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /users/me
**Description:** Update current user profile
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Full name of the user |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /users/me/password
**Description:** Change user password
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error or incorrect current password |

---

## Workload

### GET /workspaces/:slug/projects/:projectId/workload
**Description:** Get project workload statistics
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug/workload
**Description:** Get workspace workload statistics
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### PATCH /workspaces/:slug/members/:userId/leave
**Description:** Toggle member leave status
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

## Workspaces

### POST /workspaces
**Description:** Create a new workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Workspace name (2-50 chars) |
| string | string | No | URL to the workspace logo |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### GET /workspaces
**Description:** Get current user workspaces
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

---

### GET /workspaces/:slug
**Description:** Get workspace by slug
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 404 | Workspace not found |

---

### PATCH /workspaces/:slug
**Description:** Update workspace details
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | No | Workspace name |
| string | string | No | URL to the workspace logo |
| boolean | boolean | No | Whether the workspace is archived |
| boolean | string | No | Enable or disable email notifications |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |
| 403 | Forbidden — insufficient role |

---

### PATCH /workspaces/:slug/archive
**Description:** Archive a workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### DELETE /workspaces/:slug
**Description:** Delete a workspace permanently
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Exact name of the workspace for confirmation |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error - name mismatch |
| 403 | Forbidden — insufficient role |

---

### POST /workspaces/invites/accept
**Description:** Accept a workspace invite
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Invite token received via email |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Validation error |

---

### POST /workspaces/:slug/members
**Description:** Invite a member to the workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| string | string | Yes | Email address of the user to invite |

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### PATCH /workspaces/:slug/members/:userId/role
**Description:** Change a member role in the workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Request Body:**
| Field | Type | Required | Description |
|---|---|---|---|
| role | string | Yes | New role for the member |

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### DELETE /workspaces/:slug/members/:userId
**Description:** Remove a member from the workspace
**Auth required:** Yes
**Rate limit:** Standard limits apply

**Success Response (200):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 403 | Forbidden — insufficient role |

---

### POST /workspaces/:slug/logo
**Description:** Upload a new logo for the workspace
**Auth required:** Yes
**Rate limit:** Custom rate limit

**Success Response (201):**
```json
{
  "message": "Success"
}
```

**Error Responses:**
| Code | Description |
|---|---|
| 400 | Invalid file type or size |
| 403 | Forbidden — insufficient role |

---

## activity

### GET /workspaces/:slug/projects/:projectId/activity
**Description:** No summary
**Auth required:** Yes
**Rate limit:** Standard limits apply

---

### GET /workspaces/:slug/activity
**Description:** No summary
**Auth required:** Yes
**Rate limit:** Standard limits apply

---

## app

