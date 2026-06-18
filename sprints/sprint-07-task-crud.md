# Sprint 7 — Task CRUD (Backend + Frontend, No Real-Time Yet)

## Goal
Build the complete task management layer — all backend endpoints for creating, reading, updating, and deleting tasks, plus the frontend task list rendering inside the Board tab and the task detail slide-over panel. No real-time sync in this sprint — that is Sprint 8. By the end of this sprint a user should be able to create tasks, see them on the board, open a task, edit all its fields, manage sub-tasks, and delete tasks. Everything persists to the database and reflects on page refresh.

---

## Guiding Principles

Tasks are the core entity of the entire application. Get the data model interactions right here — every future sprint touches tasks. The task detail slide-over panel is a persistent UI element that opens on top of the board without replacing it. Inline editing means clicking a field transforms it into an input in place — there is no separate edit mode. Only the assignee and project Admins can edit task fields — enforce this on both the backend and the frontend.

---

## Backend — Task Module

Create a `TaskModule` inside `apps/api/src/task`. Import the Prisma service. Protect all endpoints with the JWT auth guard. Apply the ProjectRoleGuard from Sprint 6 to enforce project membership. Create a dedicated task ownership check utility that returns true if the authenticated user is the task assignee or a project Admin or above — this will be used on every mutating endpoint.

### Endpoints to Build

#### POST /workspaces/:slug/projects/:projectId/tasks
Create a new task. Accept title, description, status, priority, assignee user ID, due date, label, start time, and end time in the request body. Title is required. All other fields are optional. Validate with the Zod schema from `@repo/shared`. The status should default to Todo if not provided. The priority should default to Medium if not provided. The sort order should be set to the current highest sort order in the target column plus one so the new task appears at the bottom of its column. If a start time and end time are provided, after creating the task also create a CalendarBlock record for the assigned user linking to this task. Return the full task object including the assignee's name and avatar URL.

#### GET /workspaces/:slug/projects/:projectId/tasks
Return all tasks for the project. Include for each task the title, description, status, priority, due date, label, sort order, assignee details (id, name, avatar), the count of sub-tasks, the count of completed sub-tasks, the count of comments, and the count of attachments. Do not return the full comments or attachments lists here — those are loaded separately when the task panel opens. Order results by status and then by sort order within each status group.

#### GET /workspaces/:slug/projects/:projectId/tasks/:taskId
Return a single task with full details. Include all the fields from the list endpoint plus the full description text. Also include the list of sub-tasks each with their title, done status, assignee details, and due date. Do not include comments or attachments here — those have their own endpoints below.

#### PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId
Update a task. Enforce the task ownership check — only the assignee or a project Admin may call this. Accept any combination of title, description, status, priority, assignee user ID, due date, label, start time, and end time as optional fields. If the status is changing, record the old and new status in the response so the frontend can emit the right activity event type. If the assignee changes and a time slot exists, update or recreate the CalendarBlock for the new assignee and remove it from the old one. Return the updated task object.

#### PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId/reorder
Update the sort order of a task within its column. Accept the new sort order value. Also accept an array of other task IDs and their updated sort orders in the same column so a single drag-and-drop can update all affected positions atomically in one database transaction. Return a success message.

#### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId
Delete a task. Only project Admin and above may do this. This will cascade delete all sub-tasks, comments, attachments, and the associated CalendarBlock per the schema rules from Sprint 2. Return a success message.

### Sub-Task Endpoints

#### POST /workspaces/:slug/projects/:projectId/tasks/:taskId/subtasks
Create a sub-task. Accept title, optional assignee user ID, and optional due date. Return the created sub-task.

#### PATCH /workspaces/:slug/projects/:projectId/tasks/:taskId/subtasks/:subtaskId
Update a sub-task. Accept title, done status, assignee user ID, and due date as optional fields. Return the updated sub-task.

#### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId/subtasks/:subtaskId
Delete a sub-task. Return a success message.

### Comment Endpoints

#### GET /workspaces/:slug/projects/:projectId/tasks/:taskId/comments
Return all comments for a task ordered by created date ascending. For each comment include the author's name, avatar, and the comment body. For top-level comments also include their replies nested inside. Return the full thread structure in one call.

#### POST /workspaces/:slug/projects/:projectId/tasks/:taskId/comments
Create a comment. Accept the comment body and an optional parent comment ID for replies. Return the created comment with author details.

#### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId/comments/:commentId
Delete a comment. Only the comment author or a project Admin may do this. Return a success message.

### Attachment Endpoints

#### GET /workspaces/:slug/projects/:projectId/tasks/:taskId/attachments
Return all attachments for a task. For each attachment return the file name, size, MIME type, uploader details, created date, and a pre-signed MinIO download URL that is valid for one hour.

#### POST /workspaces/:slug/projects/:projectId/tasks/:taskId/attachments
Upload a file. Accept a multipart form upload. Store the file in MinIO under a path structured as `workspaceSlug/projectId/taskId/filename`. Save the Attachment record to the database with the storage key, original file name, size, and MIME type. Return the created attachment record with a download URL.

#### DELETE /workspaces/:slug/projects/:projectId/tasks/:taskId/attachments/:attachmentId
Delete an attachment. Remove the file from MinIO and delete the database record. Only the uploader or a project Admin may do this. Return a success message.

---

## Frontend — Task Store

Create a dedicated Zustand store for task state. It should hold a map of tasks keyed by task ID for the active project, a set of task IDs grouped by status column for the Kanban view, and the currently open task ID for the slide-over panel. Create actions for setting the task list, adding a task, updating a task by ID, removing a task by ID, setting the open task, and closing the panel. This store will be updated optimistically in Sprint 8 when real-time events arrive — design it with that in mind.

---

## Frontend — Board Tab

Replace the Board tab placeholder from Sprint 6 with the real board implementation. For this sprint render the tasks without drag and drop — drag and drop is Sprint 9. Display the Kanban view as the default with four columns side by side. Each column has a header showing the column name, the task count, and a progress bar. Below the header a scrollable list of task cards.

Each task card shows the title, priority badge, due date, and assignee avatar. If the due date is in the past and the task is not completed, show the due date in a lighter grey with a subtle indicator — no red, stay monochromatic. A small indicator showing the number of comments and the number of attachments as icon plus count pairs at the bottom of the card.

Clicking a task card opens the slide-over panel. The board should remain visible and interactive behind the open panel — the panel overlays from the right, it does not replace the board.

Add a new task button at the bottom of each column. Clicking it opens a minimal inline form directly in the column — just a title input and a save button. Submitting creates the task with the column's status and default priority, closes the inline form, and adds the card to the top of the column.

Add a main create task button in the project header area as well. Clicking this opens the full task creation form in the slide-over panel with all fields available.

### List View

Add the view toggle button in the board header to switch between Kanban and List. The list view shows all tasks in a table with columns for title, status badge, priority badge, due date, and assignee avatar. Rows are clickable to open the slide-over panel. Remember the user's view preference per project in localStorage.

### Filters

Add filter controls above the board. A priority dropdown, an assignee dropdown, a due date dropdown, and a label dropdown. Filtering happens client-side against the task store — no additional API calls. Filters should work identically in both Kanban and List views.

---

## Frontend — Task Detail Slide-Over Panel

This is the most important UI component in this sprint. It should slide in from the right side of the screen when a task is opened and slide out when closed. The panel should be approximately four hundred pixels wide. The board content area behind it should slightly dim but remain visible.

The panel has a fixed header with a live indicator dot (grey for now, will turn green in Sprint 8 when Socket.IO is connected), a copy link button, and a delete button visible only to admins. Below the header a four-tab navigation: Info, Sub-tasks, Comments, Attachments.

### Info Tab

Show the task title at the top as an editable heading — clicking it turns it into a text input. Below that a series of field rows each with a label on the left and the value on the right. Fields: Status (shown as a badge, clicking opens a dropdown), Priority (shown as a badge, clicking opens a dropdown), Assignee (shown as avatar plus name, clicking opens a member selector), Due date (clicking opens a date picker), Label (clicking opens an input), and Created date (read-only).

Below the fields a description section. Show the description as rendered text. Clicking it turns it into a textarea. A character count shown below the textarea.

Below the description a sub-task progress summary — fraction done out of total and a progress bar.

All inline edit changes should call the update task endpoint on blur or on Enter key press. Show a subtle saving indicator while the request is in flight. If the save fails, revert the field to its previous value and show a toast error.

Only render the fields as editable if the current user is the assignee or a project Admin. For all other roles render the fields as read-only text.

### Sub-tasks Tab

Show a list of sub-tasks each with a checkbox, the title, the assignee avatar, and the due date. Checking a checkbox calls the update sub-task endpoint to toggle the done status. The completed count out of total is shown as a fraction at the top of the tab.

An add sub-task button at the top opens an inline form with a title input, an optional assignee selector, and an optional due date picker. Submitting creates the sub-task and adds it to the list.

Clicking the title of a sub-task makes it editable inline. Clicking the delete icon on a sub-task calls the delete endpoint.

### Comments Tab

Show comments in chronological order oldest to newest. Each comment shows the author avatar, author name, relative timestamp, and comment body. For top-level comments that have replies show a toggle link showing the reply count. Clicking it expands the replies nested below with a slight left indent.

At the bottom of the tab a comment input area. A textarea with a placeholder. A submit button. A cancel button that clears the textarea. To reply to a specific comment click a Reply link on that comment — this sets the parent comment ID and shows a small "replying to name" indicator above the textarea.

### Attachments Tab

Show a drag-and-drop upload area at the top. Below that the list of existing attachments each with a file type icon, the file name, the file size, the uploader name, the upload date, and a download button. A delete button on each attachment visible only to the uploader and project admins.

Uploading a file should show a progress indicator in the upload area while the multipart request is in flight. On success add the new attachment to the list.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Creating a task via the inline column form or the full create form saves to the database and appears on the board
- Tasks load correctly from the API when the Board tab is opened
- The Kanban view shows four columns with correct task counts and progress bars
- The List view shows all tasks in a sortable table
- Filters correctly hide and show tasks client-side in both views
- Clicking a task card opens the slide-over panel
- All Info tab fields are editable inline for assignees and admins and read-only for others
- Editing a field calls the update endpoint and reflects the change
- Sub-tasks can be created, toggled, edited, and deleted
- Sub-task progress bar updates as checkboxes are toggled
- Comments load in threaded order and new comments can be posted
- Replies can be posted to existing comments and threads can be expanded or collapsed
- Files can be uploaded to the Attachments tab, stored in MinIO, and downloaded
- Deleting a task removes it from the board and closes the panel if open
- Deleting an attachment removes it from MinIO and the list
- Page refresh shows the correct task state from the database
- No colors outside the black-to-white range appear anywhere in this sprint's UI

---

## Notes for Antigravity

Do not implement drag and drop in this sprint — that is Sprint 9. Do not wire up Socket.IO events — that is Sprint 8. The task store designed in this sprint must be shaped to accept optimistic updates cleanly in Sprint 8 without a major refactor. The slide-over panel is a globally mounted component — mount it once in the project shell layout from Sprint 6 and control its visibility via the task store. Do not mount it inside individual task cards. The MinIO upload in the attachments endpoint requires the NestJS Multer integration for multipart form handling — set it up correctly so files stream directly to MinIO without buffering the entire file in memory.
