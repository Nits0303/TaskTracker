# Sprint 13 — Calendar + Meeting Requests

## Goal
Build the complete calendar system including the personal task calendar, team availability view, and the full meeting request flow. By the end of this sprint a user should be able to see their tasks on a calendar, view their colleagues' availability, request meeting slots, receive persistent notifications for incoming requests, and have accepted meetings lock on all participants' calendars in real time. This is the most complex feature sprint in the entire project — read every section carefully before starting.

---

## Guiding Principles

The calendar is not a generic calendar widget — it is a purpose-built availability and scheduling tool layered on top of the task system. Task blocks and meeting blocks are first-class citizens that share the same time grid. Colleague availability is privacy-respecting — others only ever see free or busy, never the content of what is blocking a slot. All real-time updates to calendar state go through the Socket.IO gateway from Sprint 8. The entire UI stays within the strict black-to-white monochromatic palette.

---

## Backend — Calendar Module

Create a `CalendarModule` inside `apps/api/src/calendar`. Import the Prisma service and the realtime gateway. Protect all endpoints with the JWT auth guard.

### Endpoints to Build

#### GET /workspaces/:slug/projects/:projectId/calendar/my
Return the authenticated user's calendar data for a seven-day window. Accept `startDate` and `endDate` as ISO date query parameters — the frontend always sends a seven-day range. Return two arrays in the response.

The first array is `taskBlocks` — all CalendarBlock records belonging to the authenticated user where the block falls within the requested date range. For each block include the block ID, task ID, task title, task priority, task status, start datetime, end datetime, and label.

The second array is `meetings` — all MeetingRequest records where the authenticated user is a participant and the proposed time falls within the range. For each meeting include the meeting ID, title, agenda, start datetime, end datetime, the requester's name and initials, the overall meeting status, and the authenticated user's individual participant status.

Also return a third array called `tasks` — all tasks in the project assigned to the authenticated user that have a due date falling within the requested range, even if they have no CalendarBlock. These appear on the calendar as due date markers rather than time blocks.

#### GET /workspaces/:slug/projects/:projectId/calendar/team
Return availability data for all project members for a seven-day window. Accept the same `startDate` and `endDate` parameters. For each project member return their user ID, name, initials, and an array of busy slots. Each busy slot has only a start datetime and end datetime — no titles, no task names, no meeting details. This is the privacy-respecting view. The frontend renders these as opaque blocked areas. Also return an array of free slots derived by computing the gaps between busy slots within working hours of 9 AM to 7 PM.

#### POST /workspaces/:slug/projects/:projectId/meetings
Create a new meeting request. Accept title, agenda, proposed start datetime, proposed end datetime, and an array of participant user IDs. Validate that all participants are members of the workspace. Check for conflicts — if any participant has an existing CalendarBlock or confirmed meeting overlapping the proposed slot return a four hundred nine conflict error listing which participants have conflicts and what is blocking them. If no conflicts exist create the MeetingRequest record with status Pending. Create a MeetingParticipant record for each participant with status Pending. Create a Notification record for each participant — this notification is persistent and must not auto-dismiss. Emit a `meeting:requested` Socket.IO event to each participant's personal notification channel. Return the created meeting request object.

#### PATCH /workspaces/:slug/projects/:projectId/meetings/:meetingId/respond
Accept the authenticated user's response to a meeting request. Accept a `response` field that is either Accepted or Declined. Update the MeetingParticipant record for the authenticated user. Mark the notification for this meeting as read but not dismissed — it remains visible until the user explicitly dismisses it.

If the response is Accepted check whether all other participants have also accepted. If everyone has accepted update the MeetingRequest status to Accepted and create CalendarBlock records for every participant linking to this meeting. Emit a `meeting:accepted` Socket.IO event to all participants. If not everyone has accepted yet do nothing further — the meeting stays Pending.

If the response is Declined update the MeetingRequest status to Declined. Emit a `meeting:declined` Socket.IO event to the requester only. Delete any CalendarBlock records that may have been created for other participants who already accepted — the meeting is off. Return the updated meeting participant record.

#### DELETE /workspaces/:slug/projects/:projectId/meetings/:meetingId
Cancel a meeting. Only the requester may cancel. Update the MeetingRequest status to Cancelled. Delete all associated CalendarBlock records. Create a notification for all participants informing them the meeting was cancelled. Emit a `meeting:cancelled` Socket.IO event to all participants. Return a success message.

---

## Backend — Socket.IO Meeting Events

Extend the realtime gateway from Sprint 8 to support personal notification channels in addition to project rooms. When a user connects to Socket.IO also join them to a personal room named `user:${userId}`. This allows sending events to a specific user regardless of which project room they are in.

Use this personal room to emit the following events:
- `meeting:requested` to each participant's personal room when a meeting request is created
- `meeting:accepted` to all participants' personal rooms when the meeting is fully accepted
- `meeting:declined` to the requester's personal room when any participant declines
- `meeting:cancelled` to all participants' personal rooms when the requester cancels
- `notification:new` to a user's personal room whenever any new persistent notification is created for them — this will be used again in Sprint 15

---

## Backend — Calendar Activity Events

Wire up activity logging for meeting events. After creating a meeting request call `logEvent` with event type MeetingRequested. After a meeting is accepted by all participants call `logEvent` with event type MeetingAccepted. After a decline call `logEvent` with event type MeetingDeclined. These will appear in the activity feed from Sprint 11.

---

## Frontend — Calendar Store

Create a Zustand store for calendar state. It should hold the current week offset as a number representing how many weeks forward or backward from the current week the user is viewing, the user's own calendar data including task blocks, meetings, and due date markers, the team availability data keyed by user ID, the active view mode which is either my or team, and a boolean for loading state. Create actions for setting the week offset, setting the calendar data, setting the team data, and updating a specific meeting's status when a Socket.IO event arrives.

---

## Frontend — Calendar Tab

Replace the Calendar tab placeholder from Sprint 6 with the full calendar implementation.

### Header Row
The calendar header has two sections. On the left a view mode toggle with two options: My calendar and Team availability. On the right a week navigation row with a previous week chevron button, a label showing the current seven-day range formatted as "Jun 9 – Jun 15", a next week chevron button, and a today button that snaps back to the current week.

### Week Grid
The main content area is a time grid. On the left a narrow time label column showing hours from 9 AM to 7 PM in one-hour increments. Each hour is a row of fixed height — use thirty-six pixels per hour. To the right of the time labels the day columns are arranged horizontally. There are seven day columns one per day of the week. Each day column has a header showing the abbreviated day name and the date number. Today's date should have a subtle near-white circle behind the date number. Past dates should have slightly dimmer header text.

The grid body is scrollable vertically. On page load scroll the grid to 9 AM automatically so the working hours are immediately visible without manual scrolling.

### My Calendar View

In my calendar view each day column belongs to the authenticated user. Render three types of blocks within the grid:

Task blocks from CalendarBlock records appear as filled rectangles spanning their start to end time. Their height is proportional to their duration — one hour equals thirty-six pixels. They show the task title truncated to fit. They use a mid-grey fill with a slightly lighter left border to create a visual accent. Clicking a task block opens the task slide-over panel for that task.

Meeting blocks from accepted MeetingRequest records appear similarly but with a slightly different visual treatment — a lighter grey fill and a dashed border to distinguish them from task blocks. They show the meeting title. Clicking opens the meeting detail popover described below.

Pending meeting blocks use the same size as confirmed meetings but show with a very subtle dashed border and dimmer fill to indicate they are not yet confirmed.

Due date markers for tasks with a due date but no time block appear as a slim horizontal line at the top of the due date's column with a small label showing the task title. They do not take up time slot space.

Empty time slots are clickable. Clicking an empty slot on your own calendar opens the meeting request form pre-filled with that time slot. If the slot overlaps an existing block show a warning in the form.

### Team Availability View

In team availability view the day columns are replaced by member columns. Instead of seven day columns there are one column per project member. The column header shows the member's initials avatar and their first name. The rows still represent time slots from 9 AM to 7 PM.

Busy slots from the team availability endpoint are rendered as solid dark grey filled blocks labeled "Busy" with no further detail. Free slots are the natural empty cell background — slightly lighter than the busy fill so the contrast is clear.

Clicking a free slot on a colleague's column opens the meeting request slide-over form.

If viewing a day range that includes today highlight today's column with a very slightly lighter background compared to other days.

### Week Navigation

When the user clicks previous week or next week update the week offset in the store and re-fetch both the personal calendar data and the team availability data for the new week. Show a brief skeleton shimmer on the grid cells while fetching. The week offset is limited to three weeks in either direction from the current date — do not allow navigating further than three weeks into the past or three weeks into the future.

---

## Frontend — Meeting Request Form

When the user clicks an empty time slot on the team view or clicks the request meeting button the meeting request slide-over panel opens. This is a separate slide-over panel — not the task detail panel. It slides in from the right at the same width.

The form has the following fields in order: a title input, an agenda textarea that is optional and collapses if empty, a slot display showing the selected start and end time formatted as a readable range with an edit button that opens an inline time picker, a participants section showing the initially clicked colleague's avatar chip with an add more button that opens the member selector popover. Additional participants can be added as chips and removed individually.

Below the participants section a conflict check indicator. When any participant is added or the time slot changes automatically call the conflict check logic and show which participants are free or have a conflict. Free participants show a small available label in grey. Participants with conflicts show a warning label with the conflicting event type — Task block or Meeting. The create button is disabled if any participant has a conflict.

A create button and a cancel button at the bottom.

---

## Frontend — Meeting Detail Popover

Clicking a meeting block on the calendar opens a small popover anchored to the block. The popover shows the meeting title, the time range, the agenda if present, the list of participants with their individual response status shown as a small icon, and action buttons. If the authenticated user has not yet responded show Accept and Decline buttons. If they have already responded show their current response as a badge with an option to change it. If the authenticated user is the requester show a Cancel meeting button instead.

---

## Frontend — Real-Time Calendar Updates

Listen for the following Socket.IO events and update the calendar store accordingly:

When `meeting:requested` arrives add the new pending meeting to the user's calendar if the proposed slot falls within the currently viewed week. Also trigger a notification — this is handled more fully in Sprint 15 but for now show a toast saying a new meeting request arrived.

When `meeting:accepted` arrives update the meeting's status in the store to Accepted and change its visual treatment from pending to confirmed on the calendar.

When `meeting:declined` arrives update the meeting status and show a toast to the requester saying which participant declined.

When `meeting:cancelled` arrives remove the meeting block from the calendar and show a toast to participants saying the meeting was cancelled.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The My calendar view shows the authenticated user's task blocks, meeting blocks, and due date markers on the correct day and time slots
- The Team availability view shows each project member as a column with busy and free slots
- Clicking a free slot on the team view opens the meeting request form pre-filled with that slot
- The conflict checker correctly identifies and displays participants with conflicting blocks
- Submitting the meeting request creates the database records and sends persistent notifications
- Accepting a meeting updates all participants' calendars and locks the time slot
- Declining a meeting notifies the requester and removes any locked blocks
- Cancelling a meeting removes blocks and notifies all participants
- Real-time Socket.IO events update the calendar without a page refresh
- Week navigation fetches fresh data for the new week range
- The time grid scrolls to 9 AM on load
- Today's column is visually distinguished in team view
- Meeting detail popover shows correct status and action buttons per user role
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

This is the most complex sprint in the project. Read the entire document before writing a single line. The personal Socket.IO room `user:${userId}` introduced in this sprint is the foundation for all notification delivery in Sprint 15 — implement it generically in the gateway. The conflict detection endpoint must use a database query not in-memory comparison — query for overlapping CalendarBlocks and MeetingParticipant records using datetime range overlap logic. The time grid is a custom layout built with CSS grid or absolute positioning — do not use a calendar library. Keep the time grid component self-contained and well-typed so it is easy to extend in Sprint 15 when notification badges are added to calendar events.
