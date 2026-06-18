# Sprint 17 — Edge Cases + Offline Handling + Conflict Resolution

## Goal
Harden the entire application against real-world failure scenarios. By the end of this sprint the application must handle concurrent task updates gracefully, recover cleanly from network disconnections, respond correctly to every invalid input and missing resource, and never leave the UI in a broken or inconsistent state regardless of what the server or network does. This sprint touches every layer of the stack — backend guards, frontend error boundaries, Socket.IO reconnection, and optimistic update rollback. No new features. Only resilience.

---

## Guiding Principles

Every failure must be handled deliberately. Silent failures are not acceptable — the user must always know when something went wrong and what to do about it. Every optimistic update must have a rollback path. Every API error must produce a human-readable message. Every network interruption must be recovered from automatically where possible. The application should degrade gracefully — if real-time sync is unavailable the app still works via REST polling.

---

## Backend — Consistent Error Responses

Audit every endpoint across all modules — auth, workspace, project, task, comment, attachment, activity, dashboard, calendar, workload, and notification. Every endpoint must return errors in the same JSON shape: an object with a `message` string, a `statusCode` number, and a `timestamp` ISO string. No endpoint should ever return a raw NestJS exception object, a Prisma error object, or an unformatted string.

Create a global exception filter in `apps/api/src/common/filters` that catches all unhandled exceptions and formats them into the standard shape. Register it as a global filter in the NestJS app bootstrap. The filter should distinguish between known HTTP exceptions and unknown errors — unknown errors should return a five hundred status with a generic message never exposing internal details. Log unknown errors to the console with the full stack trace for debugging.

Audit all Prisma calls for unhandled rejection cases. Specifically handle the Prisma not found error code P2025 and convert it to a four hundred four response. Handle the unique constraint violation error code P2002 and convert it to a four hundred nine conflict response with a human-readable message indicating which field caused the conflict.

---

## Backend — Concurrent Update Conflict Resolution

Implement last-write-wins conflict resolution with server-side timestamp comparison on the task update endpoint.

Add a `version` integer field defaulting to one on the Task Prisma model. Run a migration named `add-task-version`. Every time a task is updated increment the version by one in the same Prisma update call.

Modify the `PATCH /tasks/:taskId` endpoint to accept an optional `version` field in the request body. If the version is provided compare it to the current version stored in the database. If they match the update is safe — proceed and increment the version. If they do not match it means another user updated the task after the client last fetched it. In this case return a four hundred nine conflict response with a message saying the task was modified by another user and include the current full task object in the response body so the client can reconcile.

On the frontend when a four hundred nine conflict response is received on a task update rollback the optimistic update in the Zustand store, replace the task in the store with the server version from the conflict response body, show a toast saying the task was updated by another user and their changes have been applied, and re-render the affected task card and the open task panel with the fresh server data.

---

## Backend — Input Validation Hardening

Audit every endpoint's request body validation. Every endpoint that accepts a request body must validate it with a Zod schema from `@repo/shared` or an inline schema. No endpoint should silently ignore unexpected fields — use Zod's `.strict()` mode on all schemas to reject unknown fields with a four hundred bad request.

Add the following specific validations that may be missing: task title must be between one and two hundred characters, task description must not exceed five thousand characters, comment body must be between one and ten thousand characters, workspace name must be between two and fifty characters, workspace slug must match a URL-safe pattern of lowercase letters digits and hyphens only, project name must be between two and one hundred characters, email fields must be valid email format, date fields must be valid ISO date strings, and enum fields must only accept the defined enum values.

---

## Backend — Rate Limiting

Install the `@nestjs/throttler` package. Configure a global rate limiter allowing a maximum of one hundred requests per minute per IP address. Apply a stricter limit of ten requests per minute on the auth endpoints — register, login, and accept-invite — to prevent brute force attacks. Configure the throttler to use Redis as its storage backend using the existing Redis client so rate limit state persists across server restarts.

---

## Backend — Large Dataset Handling

Audit every endpoint that returns a list and ensure none of them return unbounded results. Every list endpoint must have a maximum page size of one hundred items regardless of what the client requests. Add this cap silently — do not return an error if the client requests more than one hundred, just cap it. Endpoints that do not currently support pagination but could return large results should have an implicit limit applied.

For the task list endpoint specifically add a database-level index on the project ID and status columns if not already present. Also add an index on the task due date column for the overdue query in the dashboard module. Run a migration named `add-task-indexes` to create these indexes.

---

## Frontend — Error Boundaries

Wrap every major page section in a React error boundary. Create a reusable `ErrorBoundary` component in the shared components directory. It should catch any rendering errors in its child tree, log the error to the console, and render a fallback UI. The fallback shows a dark grey card with a heading saying something went wrong, a brief description, and a retry button that resets the error boundary state and re-renders the children.

Apply error boundaries at the following levels: the entire project shell, each individual tab content area, the task slide-over panel, the notification bell panel, and the calendar grid. This ensures that a crash in one part of the UI does not take down the entire application.

---

## Frontend — Offline Detection and Recovery

Enhance the offline handling introduced in Sprint 8 to cover more scenarios.

Create a global network status hook called `useNetworkStatus` that listens to the browser's `online` and `offline` events. When the browser goes offline set a global offline flag in the Zustand root store. When it comes back online clear the flag.

The offline banner from Sprint 8 should now respond to both the browser offline event and the Socket.IO disconnect event. Show the banner immediately when either condition is true. The banner message should distinguish between the two cases — "You are offline" when the browser has no network and "Reconnecting to live updates..." when the browser is online but the Socket.IO connection is lost.

When the Socket.IO connection is restored and the browser is online automatically re-fetch the task list for the active project using TanStack Query's `refetchOnWindowFocus` or a manual refetch trigger. Also re-fetch the notification list and the activity feed if either tab is currently open. This ensures the UI catches up on all changes that happened during the disconnection.

If the browser has been offline for more than thirty seconds and comes back online show a toast saying the app is syncing and trigger a full re-fetch of the active project's task list, member list, and the current open task's details if the panel is open.

---

## Frontend — Optimistic Update Audit

Audit every mutation in the application and ensure every single one has a proper rollback path. The mutations that must have rollbacks are: creating a task, updating any task field, changing a task status via drag, reordering tasks, creating a sub-task, toggling a sub-task checkbox, posting a comment, uploading an attachment, deleting an attachment, accepting or declining a meeting request, toggling the on leave status, and changing a member role.

For each mutation ensure the following pattern is followed: snapshot the relevant slice of the Zustand store before the API call, apply the optimistic update to the store, await the API call, on success do nothing or apply any server-side fields like generated IDs that were not available optimistically, on failure restore the store from the snapshot and show a toast with a human-readable error message.

Create a reusable utility function called `optimisticMutation` that accepts a store snapshot function, a store update function, an API call function, an optional onSuccess callback, and an error message string. It handles the snapshot, the optimistic update, the API call, the rollback, and the toast in one reusable wrapper. Refactor all existing optimistic mutations to use this utility.

---

## Frontend — Invalid Route Handling

Create a custom not found page at `app/not-found.tsx` in the Next.js app. The page should be minimal — the app name, a large four zero four heading, a brief message, and a button to go back to the workspace home or to login if not authenticated.

Handle the case where the workspace slug in the URL does not exist or the user is not a member. In the workspace layout, if the workspace fetch returns a four hundred four or four hundred three redirect to the workspace selector page with a toast saying the workspace was not found or access was denied.

Handle the case where the project ID in the URL does not exist or the user does not have access. In the project shell layout, if the project fetch returns a four hundred four or four hundred three redirect to the workspace home with a toast.

Handle the case where a task ID in the URL query parameter does not exist when the panel tries to open. If the task fetch returns a four hundred four close the panel, remove the query parameter from the URL, and show a toast saying the task no longer exists.

---

## Frontend — Form Validation UX Hardening

Audit every form in the application and ensure the following standards are met everywhere: required field errors only show after the user has touched the field or attempted to submit, not immediately on page load. Error messages are specific — never just "Invalid input", always a message like "Workspace name must be at least 2 characters". The submit button shows a loading spinner while in flight and is disabled during the request to prevent double submission. After a successful submission any form that should reset does reset. After a failed submission the form retains all entered values so the user does not have to retype everything.

---

## Frontend — Toast System Hardening

Audit the toast system from Sprint 5. Ensure it handles the following: a maximum of three toasts visible at once — if a fourth arrives dismiss the oldest. Each toast has an explicit type: success, error, info, and warning — even though no colors are used the type affects the icon shown and the border brightness level. Error toasts should stay visible for six seconds instead of the standard four. A dismiss X button on every toast. Toasts should not obstruct the notification bell panel or the task slide-over panel — position them so they never overlap these elements.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Every endpoint returns errors in the standard shape with message, statusCode, and timestamp
- The global exception filter catches unhandled exceptions and returns five hundred with a generic message
- Prisma P2025 errors produce four hundred four responses and P2002 errors produce four hundred nine responses
- The task version field is in the database and the conflict response returns the current task object on mismatch
- A concurrent update conflict on the frontend rolls back the optimistic update and shows the server version
- All Zod schemas use strict mode and reject unknown fields
- All input length and format validations are in place across every endpoint
- Rate limiting is active — auth endpoints are limited to ten per minute per IP
- Every list endpoint has a maximum page size of one hundred
- Task indexes exist on project ID plus status and on due date
- Error boundaries are applied at all six levels and the fallback UI renders correctly on a forced error
- The offline banner correctly distinguishes between browser offline and Socket.IO disconnect
- Re-fetch on reconnect correctly restores task and notification state
- The optimisticMutation utility is in place and all mutations use it
- Custom four zero four page exists and renders correctly
- Invalid workspace slug and project ID redirect correctly with toasts
- Invalid task ID in query param closes the panel with a toast
- All form validation shows errors only after touch or submit attempt
- Toast system handles maximum three visible, type-based border brightness, and six second error duration
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

This sprint has no new features — it is entirely about hardening existing ones. Read through every module's code before making changes. The global exception filter must be registered in `main.ts` using `app.useGlobalFilters` before any other global middleware. The `optimisticMutation` utility should be placed in `apps/web/src/lib/optimisticMutation.ts` and exported for use across all store files. The task version conflict resolution on the frontend must update the task in the store using the same store update action used by Socket.IO delta events — do not create a separate code path for conflict resolution updates. The rate limiter Redis storage means the throttler module must import the Redis module — wire this up carefully to avoid circular module dependencies.
