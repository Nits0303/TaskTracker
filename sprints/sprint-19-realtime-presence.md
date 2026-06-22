# Sprint 19 — Real-Time Presence (Online Status, Scoped Viewers, Typing Indicators)

## Goal
Add a complete presence layer on top of the existing real-time infrastructure from Sprint 8. By the end of this sprint every user should see which of their workspace members are Active, Away, or Offline in the sidebar, see who is currently viewing the board or a specific task they have open, and see a typing indicator when someone else is composing a comment on the same task. Presence is ephemeral — it reflects the current moment only and is never written to the Activity Feed or any permanent audit log.

---

## Guiding Principles

Presence state lives in Redis, not PostgreSQL. It is fast-changing, high-frequency, and low-value historically — there is no business reason to keep a permanent record of every time a user went online or offline. The only durable trace of presence is a single "last seen" timestamp per user, updated in place, never appended to a log.

Presence must work correctly across multiple server instances in the future, so all presence state must go through Redis rather than in-memory variables on the NestJS gateway. The personal Socket.IO room pattern already exists conceptually for notifications — presence reuses the same idea of per-user and per-room broadcasting established in Sprint 8.

Never block or slow down any existing real-time event flow to add presence — it is an additive layer.

---

## Backend — Database Changes

Add a `lastSeenAt` nullable datetime field to the `User` Prisma model. This is the only schema change required for this sprint. Run a Prisma migration named `add-last-seen-at`. This field is updated whenever a user fully disconnects from Socket.IO with no remaining active connections, and is used to power a "last seen X ago" display when a user is offline. Do not add any other presence-related tables or models — everything else lives in Redis.

---

## Backend — Presence Module

Create a `PresenceModule` inside `apps/api/src/presence`. Import the Redis client from Sprint 8 and the realtime gateway. This module owns all presence logic and exposes a clean service that the gateway and other modules can call without knowing about Redis key structures directly.

### Redis Key Design

Use the following key patterns, all with short TTLs so stale state self-expires even if a disconnect event is ever missed:

A key per user storing their current status as a string of either Active, Away, or Offline, with a TTL of around ninety seconds that is refreshed on every heartbeat. If this key expires without being refreshed, the user is treated as Offline.

A key per user storing a count of how many active socket connections they currently have, since a user can have the app open in multiple tabs or devices. Increment on connect, decrement on disconnect. Only mark the user fully Offline when this count reaches zero.

A set per project room storing which user IDs currently have that project's board open, used for scoped board presence.

A set per task storing which user IDs currently have that specific task's detail panel open, used for scoped task presence.

A set per task storing which user IDs are currently typing in that task's comment box, with a short TTL of a few seconds per user that must be continuously refreshed while typing, so a typing indicator never gets stuck on if a client disconnects mid-type.

### Presence Service Methods

Create a `PresenceService` with clean methods that the gateway calls: one to mark a user as connected and increment their connection count, one to mark a user as disconnected and decrement the count, one to update a user's status to Active or Away, one to record a user joining or leaving a project board's viewer set, one to record a user joining or leaving a specific task's viewer set, and one to record a user starting or stopping typing on a task. Each of these methods should, after updating Redis, emit the appropriate Socket.IO event to the relevant audience so connected clients update instantly.

---

## Backend — Socket.IO Gateway Extensions

Extend the realtime gateway from Sprint 8 with the following new client-emittable events:

`presence:heartbeat` — the client emits this periodically while the app is open and the user is actively interacting with it. The server refreshes the user's Active status key in Redis. If no heartbat has been received recently the user's status key naturally expires and they fall back toward Away and then Offline.

`presence:set_away` — the client emits this when the user manually sets themselves to Away, or automatically when the frontend detects the user has been idle for a configurable period. The server updates the status key immediately to Away.

`presence:set_active` — emitted when the user returns from being away, manually or automatically. Updates the status key back to Active.

`board:presence_join` and `board:presence_leave` — the client emits these when opening or closing a project board. The server adds or removes the user from that project's viewer set in Redis and broadcasts the updated viewer list to everyone else in that project's room.

`task:presence_join` and `task:presence_leave` — the client emits these when opening or closing a specific task's detail panel. The server adds or removes the user from that task's viewer set and broadcasts the updated list to the project room.

`comment:typing_start` and `comment:typing_stop` — the client emits these when the user starts or stops typing in a task's comment box. The server adds or removes them from the typing set for that task with the short TTL described above, and broadcasts the updated typing list to the project room, excluding the typer themselves.

### Connection and Disconnection Lifecycle

On `handleConnection`, after the existing JWT validation from Sprint 8 succeeds, call the presence service to increment the user's connection count and set their status to Active. Also join the user to a personal room named `user:${userId}` if this is not already done from a previous sprint, since presence status broadcasts can use this channel for workspace-wide updates.

On `handleDisconnect`, call the presence service to decrement the connection count. If the count reaches zero, mark the user as Offline in Redis, write the current timestamp to the `lastSeenAt` field on the User record in PostgreSQL via Prisma, and broadcast the user's Offline status to relevant rooms. Also remove the user from any board or task viewer sets and any typing sets they were part of, so a hard disconnect (closed tab, lost network) does not leave stale presence behind.

### Broadcasting Workspace-Wide Status

When a user's status changes between Active, Away, and Offline, broadcast a `presence:status_changed` event containing the user ID and new status to every other member of every workspace that user belongs to. Since workspace membership can be looked up from PostgreSQL, cache the list of a user's workspace IDs briefly in Redis to avoid a database hit on every single status change, with a short TTL and invalidation when workspace membership changes.

---

## Frontend — Presence Store

Create a dedicated Zustand store for presence state. It should hold a map of user ID to status (Active, Away, or Offline) for everyone the current user can see, a map of project ID to the list of user IDs currently viewing that project's board, a map of task ID to the list of user IDs currently viewing that task, and a map of task ID to the list of user IDs currently typing in that task's comments. Create actions for setting and updating each of these independently so a single incoming event only touches the relevant slice of state.

---

## Frontend — Presence Hooks

Create a `useHeartbeat` hook that, once the user is authenticated and the socket is connected, emits `presence:heartbeat` on a fixed interval of around thirty seconds for as long as the app tab is open and the browser reports the page as visible. Use the Page Visibility API to pause heartbeats when the tab is hidden in the background.

Create a `useIdleDetection` hook that listens for mouse movement, key presses, and scroll events. If none of these occur for a configurable idle period of around five minutes, automatically emit `presence:set_away`. As soon as any of these events fire again after being away, emit `presence:set_active`. This hook should also expose a manual override function so the user can deliberately set themselves to Away from a UI control regardless of activity, and that manual choice should not be immediately overridden by the next mouse movement — once manually set to Away, only a manual switch back to Active or a fresh sign-in should clear it.

Create a `useBoardPresence` hook that accepts a project ID. On mount, after a debounce of two to three seconds to avoid flicker when a user is quickly navigating through projects, emit `board:presence_join`. On unmount or if the project ID changes, emit `board:presence_leave` for the previous project ID. This hook should be used in the project shell layout from Sprint 6 alongside the existing `useProjectRoom` hook from Sprint 8.

Create a `useTaskPresence` hook that accepts a task ID, used the same way but scoped to the task detail slide-over panel from Sprint 7. Apply the same debounce before emitting `task:presence_join`, and emit `task:presence_leave` on close.

Create a `useTypingIndicator` hook used inside the Comments tab's input area. Emit `comment:typing_start` when the user begins typing in the comment textarea, and emit `comment:typing_stop` either when the textarea becomes empty, when the comment is submitted, or after a short pause of a few seconds with no further keystrokes. Internally debounce so rapid keystrokes do not flood the server with repeated typing_start events — only emit it once per typing session until a stop event fires.

---

## Frontend — Sidebar Online Status

Update the sidebar member list area established in Sprint 5 to show a small status dot next to each member's avatar. Active status shows as a bright near-white filled dot. Away status shows as a dimmer grey outlined dot. Offline status shows as no dot, or the dot omitted entirely, with the member's row slightly dimmed to deprioritize it visually compared to online members. Stay strictly within the monochromatic palette — brightness and fill are the only differentiators, never color.

When hovering over an offline member's avatar, show a tooltip with the relative last seen time, for example "Last seen 2 hours ago," computed from the `lastSeenAt` field returned by the API. This field should be included in the existing workspace members endpoint response from Sprint 5 going forward.

The sidebar should subscribe to `presence:status_changed` events for all visible members and update the relevant dot instantly without a full re-fetch of the member list.

---

## Frontend — Scoped Board and Task Presence

In the project header area established in Sprint 6, extend the existing member avatar stack to additionally show, with a subtly distinct visual treatment such as a slightly brighter ring around the avatar, which of those members currently have the board open right now based on the board presence data from the store. This reuses the same avatar stack component rather than introducing a second one.

In the task detail slide-over panel header from Sprint 7, add a small avatar stack showing who else currently has this specific task open, positioned near the existing live indicator dot. If no one else is viewing the task, show nothing extra — do not show an empty stack. If one or more others are viewing, show their avatars with initials, and if there are more than three show a count badge for the remainder, following the same overflow pattern already used for the project member stack.

---

## Frontend — Typing Indicator in Comments Tab

In the Comments tab of the task detail panel, when one or more other users are typing, show a small subtle line below the comment list and above the comment input area, for example "Priya is typing..." for one person, or "Priya and Rohan are typing..." for two, or "Several people are typing..." if there are three or more. This text should use tertiary grey and should appear and disappear smoothly rather than abruptly. It should never include the current user's own typing state.

---

## Edge Cases to Handle

If a user has the app open in two browser tabs and closes one, they should remain Active because their connection count in Redis is still above zero. Only closing the last tab or losing all connections should transition them to Offline.

If a user's network drops without a clean disconnect event firing, the Active status key's TTL will naturally expire after its window passes, and the frontend should treat an expired or missing status as Offline once observed via heartbeat or a subsequent fetch, even if the explicit `handleDisconnect` lifecycle hook never technically fires on the server. Build the frontend to tolerate this gracefully rather than assuming disconnects are always clean.

If a user manually sets themselves to Away and then closes the laptop lid, on reconnect they should still be shown as Away rather than snapping back to Active automatically, until they explicitly interact again or manually switch back.

Typing indicators must never get stuck visible if a user starts typing and then their browser crashes or loses connection mid-keystroke — rely on the short TTL on the typing set in Redis to self-clear rather than only relying on an explicit stop event.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Opening the app and logging in shows the user as Active in the sidebar to other workspace members within a few seconds
- Closing all tabs or losing connection transitions the user to Offline and updates their `lastSeenAt` timestamp
- Being idle for the configured period automatically transitions a user to Away, and resuming activity transitions them back to Active
- Manually setting Away persists until the user manually returns to Active
- Opening a project board adds the user to that board's scoped viewer set after the debounce period, visible to other members as a highlighted ring on their avatar in the member stack
- Opening a task adds the user to that task's scoped viewer set, visible as an avatar stack in the task panel header
- Typing in the comment box on an open task shows a typing indicator to other users with that same task open within about a second
- Typing indicators clear within a few seconds of stopping typing or submitting the comment, even without an explicit stop event firing
- All presence state is stored in Redis with appropriate TTLs and is never written to the Activity Feed or any permanent log table
- The only persistent trace of presence is the `lastSeenAt` field on the User model, updated in place
- Hovering an offline member in the sidebar shows a relative last seen tooltip
- No colors outside the black-to-white range appear anywhere in any presence-related UI

---

## Notes for Antigravity

Do not create an ActivityEvent entry for any presence transition under any circumstances — this was deliberately decided against in favor of ephemeral Redis state plus a single denormalized `lastSeenAt` field. Do not build a second avatar stack component for board or task presence — extend the existing avatar stack component from Sprint 6 with an optional prop indicating which subset of members are currently active viewers. The heartbeat, idle detection, board presence, task presence, and typing indicator hooks should all be small, single-purpose hooks that compose together rather than one large monolithic presence hook — this keeps them independently testable and reusable. Every Redis key introduced in this sprint must have an explicit TTL; do not introduce any presence-related Redis key without one, since unbounded keys are exactly the kind of stale state this feature must avoid by design.
