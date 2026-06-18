# Sprint 15 — Notifications (In-App + Email + Browser Push)

## Goal
Build the complete notification system across all three delivery channels — in-app bell notifications, email via Nodemailer, and browser push notifications. By the end of this sprint every relevant action in the application should trigger the appropriate notification to the right recipients through the right channels based on their preferences. Persistent notifications from the meeting request system in Sprint 13 should be fully surfaced in the notification bell. The notification bell itself must be polished and production-ready.

---

## Guiding Principles

Notifications must never block the main application flow. Every notification dispatch is fire-and-forget — queued asynchronously via BullMQ exactly like the activity feed in Sprint 11. Email and push dispatch can be slow — they must never make the user wait. In-app notifications are the primary channel and always on. Email and browser push are opt-in per user and toggled in profile settings. Meeting request notifications are persistent — they stay until manually dismissed. All other notifications are standard — they can be marked as read and dismissed.

---

## Backend — Notification Module

Create a `NotificationModule` inside `apps/api/src/notification`. Import the Prisma service, the Redis client, the realtime gateway, and the BullMQ queue infrastructure from Sprint 11.

### Notification Queue

Create a BullMQ queue named `notifications`. This queue handles all three delivery channels. Each job in the queue has a type field indicating which channel to use — inApp, email, or push — and a payload with the recipient user ID, the notification type, the message, and any reference data.

Create a `NotificationService` with a method called `dispatch`. This method accepts a notification payload and adds three jobs to the queue — one per channel — for each recipient. The caller never awaits dispatch — it is always fire-and-forget.

Create a worker that processes jobs from the `notifications` queue with a concurrency of ten. The worker routes each job to the appropriate handler based on the job type field.

### In-App Notification Handler

The in-app handler should create a Notification record in PostgreSQL using Prisma. The record includes the recipient user ID, notification type, message body, a boolean for read status defaulting to false, a boolean for dismissed status defaulting to false, and the optional reference ID pointing to the related entity. After creating the record emit a `notification:new` event to the recipient's personal Socket.IO room `user:${userId}` from Sprint 13. The event payload should include the full notification object so the frontend can prepend it to the bell list without an additional API call.

### Email Notification Handler

Use Nodemailer to send email notifications. Configure a Nodemailer transporter using SMTP settings from environment variables — host, port, user, and password. For local development configure it to use Ethereal Email which is a free fake SMTP service that captures emails without sending them. Log the Ethereal preview URL to the console so emails can be inspected during development. For production the same SMTP config will point to a real mail provider.

Before sending check the recipient's notification preferences in the database. If the user has email notifications disabled skip the send and mark the job as completed without error. If enabled compose a simple plain text email with the notification message and send it. Do not build HTML email templates — plain text only for now.

Add the following environment variables to the api app's `.env.example`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### Browser Push Notification Handler

Use the `web-push` npm package for sending browser push notifications. Generate VAPID keys using the web-push CLI and store them as environment variables `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Add both to `.env.example`.

Before sending check the recipient's notification preferences. If browser push is disabled skip. If enabled look up the user's push subscription record from the database. If no subscription exists skip. If a subscription exists call `webpush.sendNotification` with the subscription and a JSON payload containing the notification title and body. If the send fails with a four hundred ten gone error it means the subscription has expired — delete the subscription record from the database.

### Notification Preferences

Add a `NotificationPreference` model to the Prisma schema. It should have a one-to-one relation with User and contain three boolean fields: `emailEnabled` defaulting to true, `pushEnabled` defaulting to false, and a `createdAt`. Also add a `PushSubscription` model with fields for user ID, endpoint, auth key, and p256dh key — these are the three components of a browser push subscription object. Run a Prisma migration named `add-notification-models` to add both models.

Create a NotificationPreference record automatically when a new user registers — hook into the auth module's register flow to create it with default values.

### Notification Endpoints

#### GET /notifications
Return all notifications for the authenticated user that are not dismissed. Sort by created date descending newest first. Separate the results into two groups in the response: `persistent` for meeting request notifications that require action, and `standard` for all other types. Return the total unread count as a separate field. Support a `limit` query parameter defaulting to twenty.

#### PATCH /notifications/:notificationId/read
Mark a single notification as read. Return the updated notification.

#### PATCH /notifications/read-all
Mark all unread non-dismissed notifications as read for the authenticated user. Return a success message.

#### DELETE /notifications/:notificationId
Dismiss a notification. Set its dismissed flag to true. It will no longer appear in the bell list. For persistent notifications this is the only way to remove them — they cannot be auto-dismissed. Return a success message.

#### POST /notifications/push-subscription
Save a browser push subscription for the authenticated user. Accept the subscription object containing endpoint, auth, and p256dh. Create or update the PushSubscription record for this user. Return a success message.

#### DELETE /notifications/push-subscription
Remove the authenticated user's push subscription record. Called when the user revokes push permission in the browser or in their profile settings. Return a success message.

#### GET /notifications/preferences
Return the authenticated user's notification preferences.

#### PATCH /notifications/preferences
Update preferences. Accept emailEnabled and pushEnabled as optional boolean fields. Return the updated preferences.

---

## Backend — Wiring Dispatch Calls

Wire up `notificationService.dispatch` calls across the existing modules for all relevant events. In each case the dispatch is fire-and-forget — never awaited.

In the task module dispatch notifications when a task is assigned to a user — the recipient is the assignee, the message should say who assigned the task and the task title, and the reference ID is the task ID. Also dispatch when a task's due date is within twenty-four hours — this one is handled by a scheduled job described below.

In the comment module dispatch a notification to the task assignee and to the task creator when a new comment is posted — unless the commenter is the same person as the recipient. The message should say who commented and on which task.

In the meeting request module dispatch persistent notifications to all participants when a meeting is requested — these were already created as Notification records in Sprint 13 but the dispatch to email and push channels was deferred. In this sprint wire up the email and push dispatch for meeting request events using the same notification records created in Sprint 13. Also dispatch standard notifications to the requester when a participant responds.

In the workspace module dispatch a notification to the workspace owner when a new member joins via invite acceptance.

### Due Date Reminder Scheduler

Create a NestJS scheduled task using the `@nestjs/schedule` package. Schedule it to run every hour. The job should query for all tasks where the due date is between now and twenty-four hours from now, the status is not Completed, and a reminder has not already been sent. Add a boolean field `reminderSent` defaulting to false to the Task Prisma model. Run a migration named `add-reminder-sent`. For each qualifying task dispatch a notification to the assignee and update the `reminderSent` flag to true to prevent duplicate reminders.

---

## Frontend — Notification Bell

The notification bell lives in the sidebar established in Sprint 5. It should be an icon button — a bell icon in secondary grey. When there are unread notifications show a small badge on the bell with the unread count. The badge should be a small near-white circle with dark text. Cap the displayed count at ninety-nine with a plus sign.

Clicking the bell opens a notification panel. This panel is not a slide-over — it is a dropdown popover anchored to the bell icon, appearing above or below depending on available space. It is approximately three hundred and twenty pixels wide and up to five hundred pixels tall with internal scrolling.

### Notification Panel Header
A title saying "Notifications" on the left. On the right two small buttons: "Mark all read" and a settings icon that navigates to the notification preferences section of the user profile settings.

### Persistent Notifications Section
If there are any persistent notifications — meeting requests awaiting a response — show them at the top of the panel under a small section label "Requires action". Each persistent notification card shows a left accent border that is slightly brighter than the card background — no color, just brightness contrast. The card shows the notification message, a relative timestamp, and Accept and Decline buttons if the notification is for a meeting request. Clicking Accept or Decline calls the meeting respond endpoint from Sprint 13 and updates the notification in the panel. After responding the card loses its accent border and the action buttons are replaced with the response badge — Accepted or Declined. The card stays in the panel until the user clicks the dismiss X button in the top right corner of the card.

### Standard Notifications Section
Below the persistent section a section label "Recent" showing the standard notifications in reverse chronological order. Each notification shows a small icon representing the notification type — a task icon for task assignments, a comment bubble for comments, a clock for due date reminders. All icons are monochromatic glyphs in secondary grey. The notification message text in near-white. The relative timestamp below in tertiary grey. Unread notifications have a very subtle left border brightness accent — one step brighter than the card background. Read notifications have no accent. A dismiss X button on hover.

### Real-Time Bell Updates
When a `notification:new` Socket.IO event arrives prepend the new notification to the correct section of the panel list — persistent section if it is a meeting request, standard section otherwise. Increment the unread count badge on the bell icon. If the panel is currently open show the new notification sliding in at the top of its section with a fade animation. If closed just update the badge count.

### Empty State
If there are no notifications in either section show a centered empty state inside the panel with a bell icon and the text "You are all caught up."

---

## Frontend — User Profile Settings

Create a user profile settings page at `/profile`. This page has two sections.

The first section is profile details. An avatar circle showing the user's initials at the top with an upload button to change it. Below that an editable name field and a read-only email field. A save button.

The second section is notification preferences. A heading "Notification preferences". Three toggle rows identical in style to the toggles in the workspace settings from Sprint 5. The first toggle is "Email notifications" with a sub-label listing what triggers emails. The second toggle is "Browser push notifications" with a sub-label. Below the push toggle a "Enable browser push" button that appears when push is not yet subscribed — clicking it calls the browser Notification API to request permission, gets the push subscription object, and posts it to the push-subscription endpoint. If permission is denied show a message explaining how to enable it in browser settings. The third toggle row shows the current push subscription status — "Push enabled on this device" or "Not enabled".

A save button for the preferences that calls the update preferences endpoint.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Assigning a task creates an in-app notification for the assignee visible in the bell immediately via Socket.IO
- Adding a comment creates in-app notifications for the task assignee and creator excluding the commenter
- Meeting request notifications are persistent and appear in the Requires action section
- Accepting or declining from the bell panel calls the correct endpoint and updates the card
- Dismissing any notification removes it from the panel
- Mark all read clears the unread count badge
- The due date reminder scheduler runs hourly and dispatches notifications for tasks due within twenty-four hours without sending duplicates
- Email dispatch uses Nodemailer with Ethereal in development and logs the preview URL to the console
- Push subscription can be saved from the profile settings page
- Push notifications are sent when push is enabled and a subscription exists
- Disabling email or push in preferences stops those channels from dispatching
- The Prisma migration adding NotificationPreference, PushSubscription, and reminderSent runs cleanly
- The profile settings page saves name and notification preferences correctly
- The notification bell badge shows the correct unread count at all times
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

Install `web-push` and `@nestjs/schedule` in the api app. Install `nodemailer` and its types. Do not install any email template library — plain text emails only. The VAPID keys must be generated once using the web-push CLI command `npx web-push generate-vapid-keys` and stored in the environment variables — never regenerate them as this would invalidate all existing push subscriptions. The due date reminder scheduler should use a database query with a datetime range — not load all tasks into memory. The `reminderSent` flag on Task is the deduplication mechanism — always check it before dispatching and always set it after dispatching in the same database transaction to prevent race conditions if the scheduler overlaps.
