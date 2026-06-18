# Sprint 8 — Real-Time Core (Socket.IO + Redis)

## Goal
Wire up the real-time layer across the entire application. By the end of this sprint every task change made by any user in a project should instantly appear on all other connected users' screens without a page refresh. This sprint touches both the backend Socket.IO server and the frontend Socket.IO client. No new UI pages — this sprint upgrades the existing board and task panel from Sprint 7 to be live.

---

## Guiding Principles

Real-time sync is a layer on top of the existing REST API — it does not replace it. The REST API remains the source of truth. Socket.IO is only responsible for pushing delta updates to connected clients so they do not have to poll. Every event carries only the minimum data needed — never the full object. Optimistic updates on the sender's side make the UI feel instant. The server confirms and other clients catch up via the emitted event.

---

## Backend — Socket.IO Gateway

Create a NestJS WebSocket gateway inside `apps/api/src/realtime`. Use the `@WebSocketGateway` decorator with CORS configured to allow the frontend origin from environment variables. The gateway should use the Socket.IO adapter.

Install and configure the `@socket.io/redis-adapter` package. Connect it to the Redis instance from Docker so that in a multi-node deployment all server instances share the same Socket.IO state. For now there is only one node but the adapter must be in place so scaling later requires no code changes.

### Room Management

When a client connects and authenticates, they should be able to join a project room. Create two events the client can emit:

The first event is `project:join`. The client sends the project ID. The server verifies the authenticated user is a member of that project — if not emit an error event back to that socket only and do nothing. If they are a member add the socket to a room named `project:${projectId}`.

The second event is `project:leave`. The client sends the project ID. The server removes the socket from that room.

On socket disconnect automatically remove the socket from all rooms it was in.

### Authentication on the Socket Connection

The Socket.IO handshake must carry the JWT access token. Accept it from the `auth` object in the handshake options on the client side. On the server side validate the token in the `handleConnection` lifecycle hook. If the token is missing or invalid disconnect the socket immediately. Attach the decoded user payload to the socket data so all event handlers can access the authenticated user without re-reading the token.

### Events to Emit to Rooms

After each of the following REST API actions succeed, emit the corresponding Socket.IO event to everyone in the project room except the sender. The sender already has the update via the REST response so do not echo back to them.

Emit `task:created` with the full new task object when a task is created. This is the one case where the full object is sent because other clients need to render a new card they have never seen.

Emit `task:updated` with only the task ID and the changed fields as a partial object when a task is updated. This is the delta update — clients merge this partial into their existing task store entry.

Emit `task:status_changed` with the task ID, old status, and new status when a task's status field specifically changes. Clients use this to move the card between columns in the Kanban view.

Emit `task:reordered` with an array of task ID and sort order pairs when a reorder happens. Clients update their sort orders accordingly.

Emit `task:deleted` with only the task ID when a task is deleted. Clients remove the card from their store.

Emit `comment:added` with the full new comment object including author details when a comment is posted. Clients append it to the open task panel if that task is currently open.

Emit `subtask:updated` with the sub-task ID and updated fields when a sub-task changes. Clients update the sub-task in the open panel.

Emit `activity:created` with the full new activity event object when any activity is logged. Clients prepend it to the activity feed if the feed is open.

### Emitting from REST Controllers

Inject the realtime gateway into the task, comment, and activity modules. After each successful database write call the appropriate emit method on the gateway. The gateway should expose clean emit methods like `emitToProject(projectId, event, data, excludeSocketId)` that the controllers call without knowing anything about Socket.IO internals.

---

## Backend — Redis Setup

Redis is already running in Docker from Sprint 1. In this sprint wire it up properly in the NestJS application.

Create a Redis module that provides an ioredis client instance connected to the Redis URL from environment variables. Export this client so it can be injected into any module that needs it.

Use the Redis client for two purposes in this sprint. First as the Socket.IO adapter backing store as described above. Second as a simple cache for the project member list — cache it with a key of `project:members:${projectId}` with a thirty second TTL. The project member list is read on every Socket.IO room join to verify membership. Caching it avoids a database query on every connection. Invalidate the cache when a project member is added or removed.

---

## Frontend — Socket.IO Client Setup

Create a singleton Socket.IO client instance in the frontend. It should be initialized once when the app loads and reused across all components. Configure it with the backend URL from environment variables. Pass the JWT access token in the `auth` object of the connection options. Set `autoConnect` to false — connect manually after the user is authenticated.

Create a custom React hook called `useSocket` that returns the socket instance and a boolean for whether it is connected. This hook should be importable by any component that needs to listen to or emit Socket.IO events.

Create a second custom hook called `useProjectRoom` that accepts a project ID. When the component using this hook mounts it should emit `project:join` with the project ID. When it unmounts it should emit `project:leave`. This hook should be used in the project shell layout from Sprint 6 so that joining and leaving the room happens automatically when the user navigates into and out of a project.

### Reconnection Handling

When the socket disconnects show the offline banner in the UI — a slim bar at the very top or bottom of the screen with a subtle pulsing grey dot and text saying the connection was lost. When the socket reconnects hide the banner and immediately fetch the full task list for the active project from the REST API to catch up on any events missed during the disconnection. This ensures the board is always in sync even after a network blip.

### Access Token Refresh on Socket

When the JWT access token is refreshed via the silent refresh mechanism from Sprint 4, update the socket's auth token as well. The socket does not need to reconnect — simply update the auth object on the existing socket instance so the next reconnection attempt uses the fresh token.

---

## Frontend — Real-Time Event Handlers

Create a custom hook called `useProjectEvents` that accepts a project ID and sets up all the Socket.IO event listeners for that project. This hook should be called once in the project shell layout alongside `useProjectRoom`.

For each incoming event update the task Zustand store:

When `task:created` arrives add the new task to the store and to the correct status column. If the Kanban board is currently rendered the new card should appear immediately without any flash or layout shift.

When `task:updated` arrives find the task by ID in the store and merge the partial update into it. All components rendering that task will re-render automatically via Zustand's reactivity.

When `task:status_changed` arrives move the task from its current status group to the new one in the store. In the Kanban view this should animate the card moving columns — a smooth opacity and position transition.

When `task:reordered` arrives update the sort order values for the affected tasks in the store.

When `task:deleted` arrives remove the task from the store. If the slide-over panel is currently showing that task close the panel and show a toast saying the task was deleted by another user.

When `comment:added` arrives check if the slide-over panel is open and showing the task this comment belongs to. If so append the comment to the comment list in real time.

When `subtask:updated` arrives check if the panel is open for the parent task. If so update the sub-task in the list.

When `activity:created` arrives if the activity feed tab is currently open prepend the event to the feed list.

---

## Frontend — Optimistic Updates

Upgrade the task mutations from Sprint 7 to be optimistic. When the current user takes an action the store should update immediately before the API call completes. If the API call fails roll back the store to the previous state and show a toast error.

Apply optimistic updates to: status change via drag and drop (Sprint 9 will add drag, but wire the optimistic logic now), inline field edits in the task panel, sub-task checkbox toggles, and task creation via the inline column form.

---

## Frontend — Live Indicator

Update the live indicator dot in the task panel header from Sprint 7. It should now reflect the actual Socket.IO connection state. When connected and in the project room show the dot as a bright near-white with a pulsing animation. When disconnected show it as a dark grey static dot. Add a tooltip on hover showing "Live" or "Reconnecting..." accordingly.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Opening a project in two browser tabs and creating a task in one tab causes the card to appear in the other tab within one second
- Updating a task field in one tab updates the same field in the other tab's open panel within one second
- Changing a task status in one tab moves the card to the correct column in the other tab
- Deleting a task in one tab removes the card in the other tab and closes the panel if open
- Adding a comment in one tab appends it to the comment list in the other tab if the same task is open
- Disconnecting from the network shows the offline banner
- Reconnecting fetches fresh task state and hides the banner
- The live indicator dot in the task panel reflects the actual connection state
- The Socket.IO handshake correctly rejects connections with invalid or missing tokens
- Joining a project room fails gracefully if the user is not a project member
- The Redis adapter is in place and the ioredis client is injectable across modules
- The project member list is cached in Redis with thirty second TTL
- No new UI pages were built in this sprint — only existing pages upgraded

---

## Notes for Antigravity

Do not build drag and drop in this sprint — that is Sprint 9. The optimistic update logic for status changes should be wired now but will only be fully exercised when drag and drop is added. Keep the gateway's emit methods clean and injectable — every future sprint that adds new real-time behaviour will call these same methods. The Redis adapter setup is mandatory even though there is only one server node right now — skipping it would require a full socket infrastructure change to add later. Never emit sensitive data over Socket.IO — task content is fine, but never emit tokens, passwords, or any auth-related data through socket events.
