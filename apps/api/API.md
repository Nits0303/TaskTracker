# Task Tracker API Documentation

This document provides a reference for all endpoints in the Task Tracker API. All endpoints (except public Auth endpoints) require a Bearer token in the `Authorization` header.

---

## Auth Module

### Register
- **Method & Path:** `POST /auth/register`
- **Description:** Registers a new user.
- **Auth Level:** Public
- **Request Body:** `{ email: string, password: string, fullName: string }`
- **Success Response (201):** `{ accessToken: string, user: { id: string, email: string, fullName: string } }` (Sets HTTP-only `refreshToken` cookie)
- **Error Responses:** `400 Bad Request` (Validation Failed), `409 Conflict` (Email already exists)

### Login
- **Method & Path:** `POST /auth/login`
- **Description:** Authenticates a user and returns tokens.
- **Auth Level:** Public
- **Request Body:** `{ email: string, password: string }`
- **Success Response (200):** `{ accessToken: string, user: { id: string, email: string, fullName: string } }` (Sets HTTP-only `refreshToken` cookie)
- **Error Responses:** `400 Bad Request` (Validation Failed), `401 Unauthorized` (Invalid credentials)

### Refresh Token
- **Method & Path:** `POST /auth/refresh`
- **Description:** Refreshes an expired access token using the HTTP-only refresh cookie.
- **Auth Level:** Public (Requires `refreshToken` cookie)
- **Request Body:** None
- **Success Response (200):** `{ accessToken: string }` (Sets new HTTP-only `refreshToken` cookie)
- **Error Responses:** `401 Unauthorized` (Invalid or missing refresh token)

### Logout
- **Method & Path:** `POST /auth/logout`
- **Description:** Logs out the current user and clears their refresh token.
- **Auth Level:** Authenticated User
- **Request Body:** None
- **Success Response (200):** `{ message: "Logged out successfully" }` (Clears `refreshToken` cookie)
- **Error Responses:** `401 Unauthorized`

### Get Current User
- **Method & Path:** `GET /auth/me`
- **Description:** Returns the profile of the currently authenticated user.
- **Auth Level:** Authenticated User
- **Success Response (200):** `{ id: string, email: string, fullName: string, avatarUrl: string | null }`
- **Error Responses:** `401 Unauthorized`

---

## Workspace Module

### Create Workspace
- **Method & Path:** `POST /workspaces`
- **Description:** Creates a new workspace and sets the creator as Owner.
- **Auth Level:** Authenticated User
- **Request Body:** `{ name: string, slug: string, logoUrl?: string }`
- **Success Response (201):** Workspace Object
- **Error Responses:** `400 Bad Request`, `409 Conflict` (Slug already taken)

### Get User Workspaces
- **Method & Path:** `GET /workspaces`
- **Description:** Returns all workspaces the authenticated user is a member of.
- **Auth Level:** Authenticated User
- **Success Response (200):** Array of Workspace Objects (includes `memberCount` and `projectCount`)
- **Error Responses:** `401 Unauthorized`

### Get Workspace by Slug
- **Method & Path:** `GET /workspaces/:slug`
- **Description:** Retrieves details for a specific workspace.
- **Auth Level:** Workspace Member
- **Success Response (200):** Workspace Object (includes members list)
- **Error Responses:** `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### Update Workspace
- **Method & Path:** `PATCH /workspaces/:slug`
- **Description:** Updates workspace settings.
- **Auth Level:** Workspace Admin or Owner
- **Request Body:** `{ name?: string, logoUrl?: string, isInviteOnly?: boolean, emailNotifications?: boolean }`
- **Success Response (200):** Updated Workspace Object
- **Error Responses:** `403 Forbidden`, `404 Not Found`

### Delete Workspace
- **Method & Path:** `DELETE /workspaces/:slug`
- **Description:** Permanently deletes a workspace.
- **Auth Level:** Workspace Owner
- **Request Body:** `{ name: string }` (Confirmation)
- **Success Response (200):** `{ success: true }`
- **Error Responses:** `400 Bad Request`, `403 Forbidden`, `404 Not Found`

### Upload Workspace Logo
- **Method & Path:** `POST /workspaces/:slug/logo`
- **Description:** Uploads a logo file to MinIO and updates the workspace.
- **Auth Level:** Workspace Admin or Owner
- **Request Body:** `multipart/form-data` with `file`
- **Success Response (201):** `{ url: string }`
- **Error Responses:** `400 Bad Request`

---

## Project Module

### Create Project
- **Method & Path:** `POST /workspaces/:slug/projects`
- **Description:** Creates a new project within a workspace.
- **Auth Level:** Workspace Admin or Owner
- **Request Body:** `{ name: string, description?: string }`
- **Success Response (201):** Project Object
- **Error Responses:** `400 Bad Request`, `403 Forbidden`, `404 Not Found`

### Get Projects
- **Method & Path:** `GET /workspaces/:slug/projects`
- **Description:** Retrieves all projects in a workspace that the user has access to.
- **Auth Level:** Workspace Member
- **Success Response (200):** Array of Project Objects
- **Error Responses:** `403 Forbidden`, `404 Not Found`

### Get Project
- **Method & Path:** `GET /workspaces/:slug/projects/:projectId`
- **Description:** Retrieves details of a specific project.
- **Auth Level:** Project Viewer
- **Success Response (200):** Project Object (includes task counts and members)
- **Error Responses:** `403 Forbidden`, `404 Not Found`

### Update Project
- **Method & Path:** `PATCH /workspaces/:slug/projects/:projectId`
- **Description:** Updates project details.
- **Auth Level:** Project Admin
- **Request Body:** `{ name?: string, description?: string, status?: string }`
- **Success Response (200):** Updated Project Object
- **Error Responses:** `400 Bad Request`, `403 Forbidden`, `404 Not Found`

### Delete Project
- **Method & Path:** `DELETE /workspaces/:slug/projects/:projectId`
- **Description:** Permanently deletes a project.
- **Auth Level:** Workspace Owner
- **Request Body:** `{ name: string }` (Confirmation)
- **Success Response (200):** `{ success: true }`
- **Error Responses:** `400 Bad Request`, `403 Forbidden`, `404 Not Found`

---

## Task Module

### Create Task
- **Method & Path:** `POST /workspaces/:slug/projects/:projectId/tasks`
- **Description:** Creates a new task.
- **Auth Level:** Project Member
- **Request Body:** `{ title: string, description?: string, status?: string, priority?: string, dueDate?: string, assigneeId?: string }`
- **Success Response (201):** Task Object
- **Error Responses:** `400 Bad Request`, `403 Forbidden`

### Get Tasks
- **Method & Path:** `GET /workspaces/:slug/projects/:projectId/tasks`
- **Description:** Retrieves all tasks for a project.
- **Auth Level:** Project Viewer
- **Success Response (200):** Array of Task Objects
- **Error Responses:** `403 Forbidden`

### Get Task
- **Method & Path:** `GET /workspaces/:slug/projects/:projectId/tasks/:taskId`
- **Description:** Retrieves a specific task and its details.
- **Auth Level:** Project Viewer
- **Success Response (200):** Task Object (includes comments and attachments)
- **Error Responses:** `403 Forbidden`, `404 Not Found`

### Update Task
- **Method & Path:** `PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId`
- **Description:** Updates a task. Supports optimistic locking via version.
- **Auth Level:** Project Member (or Assignee)
- **Request Body:** `{ title?: string, description?: string, status?: string, priority?: string, assigneeId?: string, version?: number }`
- **Success Response (200):** Updated Task Object
- **Error Responses:** `400 Bad Request`, `403 Forbidden`, `404 Not Found`, `409 Conflict` (Version mismatch)

### Delete Task
- **Method & Path:** `DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId`
- **Description:** Deletes a task.
- **Auth Level:** Project Admin (or Assignee)
- **Success Response (200):** `{ success: true }`
- **Error Responses:** `403 Forbidden`, `404 Not Found`

---

## Dashboard Module

### Get Project Dashboard
- **Method & Path:** `GET /workspaces/:slug/dashboard/project/:projectId`
- **Description:** Retrieves analytics and counts for a project dashboard.
- **Auth Level:** Project Viewer
- **Success Response (200):** Dashboard Object (Admin and Member metrics)
- **Error Responses:** `403 Forbidden`, `404 Not Found`

### Get Workspace Dashboard
- **Method & Path:** `GET /workspaces/:slug/dashboard/workspace`
- **Description:** Retrieves analytics across an entire workspace.
- **Auth Level:** Workspace Member
- **Success Response (200):** Dashboard Object
- **Error Responses:** `403 Forbidden`, `404 Not Found`

---

## Activity Module

### Get Project Activity
- **Method & Path:** `GET /workspaces/:slug/projects/:projectId/activity`
- **Description:** Retrieves paginated activity events for a project.
- **Auth Level:** Project Viewer
- **Query Params:** `page`, `limit`, `type`, `userId`
- **Success Response (200):** `{ events: Array, total: number }`
- **Error Responses:** `403 Forbidden`

### Get Workspace Activity
- **Method & Path:** `GET /workspaces/:slug/activity`
- **Description:** Retrieves paginated activity events across a workspace.
- **Auth Level:** Workspace Member
- **Query Params:** `page`, `limit`
- **Success Response (200):** `{ events: Array, total: number }`
- **Error Responses:** `403 Forbidden`

---

## Calendar Module

### Get Time Blocks
- **Method & Path:** `GET /workspaces/:slug/projects/:projectId/calendar/blocks`
- **Description:** Retrieves calendar blocks for a project and user.
- **Auth Level:** Project Viewer
- **Query Params:** `userId`, `start`, `end`
- **Success Response (200):** Array of Calendar Block Objects
- **Error Responses:** `403 Forbidden`

### Check Availability
- **Method & Path:** `GET /workspaces/:slug/projects/:projectId/calendar/availability`
- **Description:** Checks availability of users within a project.
- **Auth Level:** Project Viewer
- **Query Params:** `userIds`, `start`, `end`
- **Success Response (200):** Array of unavailable blocks
- **Error Responses:** `403 Forbidden`

---

## Notification Module

### Get Notifications
- **Method & Path:** `GET /notifications`
- **Description:** Retrieves all notifications for the current user.
- **Auth Level:** Authenticated User
- **Success Response (200):** Array of Notification Objects
- **Error Responses:** `401 Unauthorized`

### Mark Notification as Read
- **Method & Path:** `PATCH /notifications/:id/read`
- **Description:** Marks a single notification as read.
- **Auth Level:** Authenticated User
- **Success Response (200):** Updated Notification Object
- **Error Responses:** `404 Not Found`

### Mark All as Read
- **Method & Path:** `PATCH /notifications/read-all`
- **Description:** Marks all user notifications as read.
- **Auth Level:** Authenticated User
- **Success Response (200):** `{ success: true }`
- **Error Responses:** `401 Unauthorized`
