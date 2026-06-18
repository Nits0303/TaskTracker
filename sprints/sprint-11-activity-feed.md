# Sprint 11 — Activity Feed (BullMQ Queue + Frontend)

## Goal
Build the complete activity feed system end to end. This covers the Redis BullMQ queue on the backend that receives activity events from every action across the application, the worker that flushes them to PostgreSQL, the API endpoint that serves the feed, and the fully polished Activity tab on the frontend with real-time live updates, filters, pagination, and both project-scoped and workspace-wide views. By the end of this sprint the activity feed must be a living, breathing timeline of everything happening in a project and workspace.

---

## Guiding Principles

The activity feed must never slow down the main application flow. Writing to the feed is always asynchronous — it goes through a queue, never inline with the action that triggered it. The feed is append-only and immutable — events are never edited or deleted. Real-time delivery of new events to open feed tabs happens via Socket.IO using the infrastructure from Sprint 8.

---

## Backend — BullMQ Activity Queue

Create an `ActivityModule` inside `apps/api/src/activity`. Import the Redis client from Sprint 8. Set up a BullMQ queue named `activity-feed` using the ioredis client as the connection.

### Queue Producer

Create an `ActivityService` with a method called `logEvent`. This method accepts an activity event payload containing the event type, the actor user ID, the project ID, an optional task ID, and an optional metadata object for storing additional context. The method should add a job to the `activity-feed` BullMQ queue and return immediately without waiting for the job to complete. This method should be injectable and called from the task, comment, and workspace modules after every relevant action.

Wire up the following calls to `logEvent` across the existing modules:

In the task module call it after task creation with event type TaskCreated, after any task update with event type TaskUpdated, after a status change specifically with event type StatusChanged storing the old and new status in the metadata, after task completion meaning status changing to Completed with event type TaskCompleted, and after task deletion. In the comment module call it after a comment is created with event type CommentAdded. In the attachment module call it after an attachment is uploaded with event type AttachmentAdded. In the workspace module call it after a member joins with event type MemberJoined and after a member is removed with event type MemberRemoved. In the meeting request module it will be called in Sprint 13 for meeting events.

### Queue Worker

Create a BullMQ worker also inside the ActivityModule that processes jobs from the `activity-feed` queue. The worker should take each job payload and write an ActivityEvent record to PostgreSQL via Prisma. After writing the record the worker should fetch the full event with the actor's name and avatar URL and emit it to the relevant Socket.IO project room via the realtime gateway from Sprint 8 using the `activity:created` event.

Configure the worker with a concurrency of five so it can process five events simultaneously. Add basic error handling — if a job fails log the error and retry it up to three times with exponential backoff before marking it as failed. Failed jobs should remain in the BullMQ failed jobs list for inspection.

---

## Backend — Activity Feed Endpoints

### GET /workspaces/:slug/projects/:projectId/activity
Return paginated activity events for a project. Support the following query parameters: `page` defaulting to one, `limit` defaulting to six, `type` as an optional comma-separated list of event type values to filter by, `userId` as an optional filter for a specific actor, and `from` and `to` as optional ISO date strings for date range filtering. Apply all filters to the database query. Return the events in descending chronological order — newest first. Include in each event the actor's name, avatar URL, the event type, the task title if a task ID is present, the metadata, and the created timestamp. Return the total count of matching events alongside the paginated results so the frontend can show a meaningful load more button.

### GET /workspaces/:slug/activity
Return paginated workspace-wide activity events. Same query parameters as above but scoped to all projects in the workspace the authenticated user has access to. Include the project name in each event so the frontend can show which project the event came from.

---

## Frontend — Activity Feed Store

Create a Zustand store for the activity feed. It should hold two separate lists — one for the project-scoped feed and one for the workspace-wide feed. Each list stores an array of activity events and a pagination cursor tracking how many have been loaded so far. Create actions for prepending a new event to the top of the list when it arrives via Socket.IO, appending a page of events to the bottom when load more is clicked, and resetting the list when the tab is first opened or filters change.

---

## Frontend — Activity Tab

Replace the Activity tab placeholder from Sprint 6 with the full activity feed implementation.

### Tab Header
The tab header has two elements on the same row. On the left a tab switcher with two options: This project and Workspace. On the right a live indicator — a small pulsing dot in near-white with the text "Live" next to it, and a manual refresh icon button next to that.

### Filter Bar
Below the header a filter bar with three controls sitting in a single row. An event type filter that is a multi-select dropdown — the user can select one or more event types to show. An assignee filter that is a dropdown of all project members. A date range filter with four options: All time, Today, This week, This month. Next to the filters a small badge showing the number of active filters and a clear all button that appears when any filter is active.

### Event List
The event list is a vertical timeline. Each event is a row with three parts: an avatar circle on the left showing the actor's initials, a content area in the middle, and a timestamp on the right.

The content area shows the actor name in near-white bold text followed by a plain language description of the action and a link-styled reference to the task if applicable. The task reference should be clickable — clicking it opens the task slide-over panel for that task. Examples of how events should read: "Arjun S. created Fix auth bug", "Priya M. changed status of API docs from In Progress to Review", "Rohan K. added a comment on Redis setup", "Sneha T. uploaded schema.pdf to Staging deploy".

For workspace-wide events include the project name as a small grey pill badge after the action text so the user knows which project the event came from.

The timestamp shows relative time — "2m ago", "1h ago", "3d ago". Hovering the timestamp shows the absolute date and time in a tooltip.

### Real-Time Events
When a new `activity:created` Socket.IO event arrives and the Activity tab is currently open and the active scope matches (project or workspace), prepend the new event to the top of the list with a smooth slide-down animation. The new event should animate in from above pushing existing events down. If the Activity tab is not open show a small unread count badge on the Activity tab label in the project header tab bar. Clear the badge when the user opens the tab.

### Load More
At the bottom of the event list a load more button. The button shows the count of remaining events if known — for example "Load 6 more (42 remaining)". Clicking it fetches the next page and appends the events to the bottom of the list with no animation — they simply appear. The button hides when all events have been loaded. A subtle loading spinner inside the button while the next page is fetching.

### Empty State
If there are no events matching the current filters show a centered empty state with an inbox icon and the text "No activity yet." If filters are active add a sub-text saying "Try adjusting or clearing the filters."

### Workspace Tab Differences
When the Workspace tab is selected re-fetch from the workspace-wide endpoint. Events in the workspace view include the project name badge. The filter bar gains an additional project filter dropdown so the user can narrow to specific projects within the workspace. The event list otherwise looks identical.

---

## Frontend — Activity Event Formatting

Create a utility function that takes an ActivityEvent object and returns a formatted plain language string for display. This function should handle all eleven event types cleanly. Keep the formatting simple and human-readable. Store this function in a shared utility file so it can be reused anywhere in the application that needs to display activity events — for example notification toasts in Sprint 15.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Creating a task, changing a status, adding a comment, and uploading a file all generate activity events visible in the feed within two seconds
- The BullMQ worker writes events to PostgreSQL asynchronously without blocking the main action
- Failed jobs retry up to three times with exponential backoff
- The project-scoped feed loads correctly with pagination
- The workspace-wide feed loads events from all accessible projects with project name badges
- All three filters work correctly and can be combined
- Clearing filters resets the list and re-fetches from the API
- New events arrive in real time via Socket.IO and animate into the top of the list
- The unread badge on the Activity tab increments when events arrive while the tab is not open
- The load more button loads the next page and shows the remaining count
- Clicking a task reference in an event opens the task slide-over panel
- Empty states display correctly for no events and no matching filters
- The activity event formatter produces correct plain language strings for all eleven event types
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

Do not process activity events synchronously inside REST controllers. Every single call to logEvent must be a fire-and-forget queue push — the controller should never await the result. The BullMQ worker runs as a separate process concern inside NestJS using the onModuleInit lifecycle hook to start listening. The Socket.IO emit from the worker goes through the same gateway from Sprint 8 — do not create a second socket connection. The activity event formatter utility created in this sprint will be imported directly in Sprint 15 for notification message generation — build it generically enough to serve both purposes.
