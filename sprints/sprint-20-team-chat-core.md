# Sprint 20 — Team Chat (Channels, Messaging, Threading, Attachments)

## Goal
Add a complete team chat system scoped to each project. By the end of this sprint every project should have a Chat tab alongside Board, Dashboard, Activity, Calendar, Members, and Settings. Inside that tab, project members can create and join multiple channels, send messages with text and file attachments, reply in threads, edit and delete their own messages, and see read receipts showing who has seen each message. This sprint covers the core messaging system only. Mentions, task references, mute behaviour, and the unread badge are deliberately deferred to the next sprint — do not build any of that here, only the foundation it will sit on top of.

---

## Guiding Principles

This feature must be designed for channels that could realistically grow into the tens of thousands of messages over the life of a long-running project, even though many channels will stay small. Never assume a channel will stay small. Every pagination, indexing, and data modelling decision in this sprint must hold up correctly regardless of how many messages a channel eventually contains, because retrofitting this after the fact is expensive and this is exactly the kind of thing that must be right from day one.

Stay entirely within the existing open source stack — PostgreSQL via Prisma, Redis, Socket.IO, NestJS, Next.js, Zustand, MinIO. Do not introduce any new piece of infrastructure, managed service, or third-party chat backend for this feature. Everything must be buildable on what the project already runs in Docker.

All chat UI must stay strictly within the black-to-white monochromatic design system established in Sprint 1. No colors outside that range anywhere in the chat tab.

---

## Backend — Database Schema

Add the following new Prisma models. Run a migration named `add-team-chat`.

A `Channel` model representing a chat channel inside a project. Store the channel name, an optional description, whether it is private, the project it belongs to, and the user who created it. Store `createdAt` and `updatedAt`. When a project is deleted, cascade delete all its channels.

A `ChannelMember` model as the join table between User and Channel. Store the user ID, channel ID, and a `joinedAt` timestamp. This table is also where each user's `lastReadMessageId` for that channel will live — store it here as a nullable field referencing a message, since this is what powers the read receipt and unread tracking system. The combination of user ID and channel ID must be unique. When a channel is deleted, cascade delete its memberships.

A `Message` model representing a single chat message. Store the channel it belongs to, the author user ID, the message body as text, an optional parent message ID for threaded replies as a self-relation, a boolean for whether the message has been edited, and a boolean for whether it has been deleted, since deleted messages should be soft-deleted and shown as a placeholder rather than removed from the database, to avoid breaking thread structures and read receipt ordering. Store `createdAt` and `updatedAt`. Add a composite database index on channel ID and created date together, since this is the access pattern every single message list query will use and it must stay fast no matter how many messages accumulate.

A `MessageAttachment` model representing a file attached to a message. Store the message it belongs to, the original file name, the storage key in MinIO, the file size, and the MIME type. Store `createdAt`. When a message is deleted, cascade delete its attachments, but remember that messages are soft-deleted in this system, so handle attachment visibility consistently with how the message itself is handled.

Do not create a separate row per user per message for read receipts. This does not scale and is unnecessary. The single `lastReadMessageId` field per user per channel on `ChannelMember` is the entire read receipt mechanism — a message is considered read by a user if its position in the channel is at or before that user's `lastReadMessageId` position. Derive "seen by" lists by comparing each member's `lastReadMessageId` against the message in question, not by storing per-message receipt rows.

---

## Backend — Chat Module

Create a `ChatModule` inside `apps/api/src/chat`. Import the Prisma service and the realtime gateway. Protect all endpoints with the JWT auth guard and verify project membership the same way other project-scoped modules do.

### Channel Endpoints

#### POST /workspaces/:slug/projects/:projectId/channels
Create a new channel. Only Project Admin and Workspace Owner may do this, consistent with the existing role hierarchy. Accept a channel name, optional description, and a boolean for whether it is private. If private, also accept an array of user IDs to add as initial members — these must already be project members. If not private, automatically consider every current and future project member as having access, without needing explicit ChannelMember rows for every single project member upfront; only create explicit ChannelMember rows as users actually join or interact with the channel, to avoid needlessly inserting rows for members who never open the channel. Return the created channel.

#### GET /workspaces/:slug/projects/:projectId/channels
Return all channels the authenticated user has access to in this project. Public channels are visible to all project members. Private channels are only visible to users who are explicit members. For each channel return its name, description, privacy flag, member count, and the authenticated user's unread count for that channel, computed by counting messages newer than the user's `lastReadMessageId` for that channel.

#### GET /workspaces/:slug/projects/:projectId/channels/:channelId
Return a single channel's details including its member list with names and avatars.

#### POST /workspaces/:slug/projects/:projectId/channels/:channelId/members
Add a member to a private channel. Only the channel creator or a Project Admin may do this. The user being added must already be a project member.

#### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId/members/:userId
Remove a member from a private channel. Same permission rule as adding.

#### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId
Hard delete a channel. Only Project Admin and Workspace Owner may do this. This cascades and deletes every message and attachment in the channel per the schema rules above. Require the channel name to be passed in the request body as confirmation before deleting, following the same confirmation pattern used for workspace and project deletion in earlier sprints.

### Message Endpoints

#### GET /workspaces/:slug/projects/:projectId/channels/:channelId/messages
Return messages for a channel using cursor-based pagination, not offset-based pagination. Accept a `before` query parameter containing a message ID or timestamp cursor, and a `limit` defaulting to fifty with a hard maximum of one hundred. Return the most recent messages older than the cursor, ordered newest first internally but structure the response so the frontend can easily render oldest to newest. If no cursor is provided, return the most recent page. Include for each message its author's name and avatar, the body, whether it was edited, whether it was deleted, the deleted state shown as a placeholder rather than the original content if deleted, any attachments, and if it is a reply, the parent message ID. Also include, for each top-level message that has replies, a count of replies in the thread, without including the full reply contents in this list endpoint.

#### GET /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId/thread
Return all replies to a specific message in chronological order, using the same cursor pagination pattern if a thread could realistically grow large, though in practice thread sizes will usually be much smaller than channel sizes.

#### POST /workspaces/:slug/projects/:projectId/channels/:channelId/messages
Create a new message. Accept the message body and an optional parent message ID if this is a thread reply. Validate the body is not empty unless attachments are present. Create the message record. Return the created message with author details. After creating, emit the message to the channel via Socket.IO as described below.

#### PATCH /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId
Edit a message. Only the author may do this. Update the body and set the edited flag to true. Return the updated message. Emit an update event via Socket.IO.

#### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId
Soft delete a message. Only the author or a Project Admin may do this. Set the deleted flag to true rather than removing the row. Emit a delete event via Socket.IO so clients can replace the message content with a placeholder.

#### POST /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId/attachments
Upload a file attached to a message. Use the same multipart upload handling pattern as the task attachments endpoint from Sprint 7, but store files under a distinct MinIO path structured as `chat/workspaceSlug/projectId/channelId/messageId/filename`, kept separate from the task attachment path structure for clarity even though it is the same MinIO instance. Return the created attachment with a pre-signed download URL.

### Read Receipt Endpoint

#### PATCH /workspaces/:slug/projects/:projectId/channels/:channelId/read
Mark the channel as read up to a specific message ID. Accept the message ID in the request body. Update the authenticated user's `lastReadMessageId` on their `ChannelMember` record for this channel. This single endpoint is the entire mechanism for both unread counts and read receipts — call it whenever the user views the latest message in the channel.

#### GET /workspaces/:slug/projects/:projectId/channels/:channelId/messages/:messageId/seen-by
Return the list of channel members whose `lastReadMessageId` places them at or after this message's position, meaning they have seen it. Compute this by comparing each member's `lastReadMessageId` timestamp against the message's timestamp rather than maintaining a separate receipts table.

---

## Backend — Socket.IO Chat Events

Extend the realtime gateway from Sprint 8 with chat-specific events. Reuse the existing project room from Sprint 8 rather than creating a separate room per channel, since channel membership can be checked at the application level when deciding who to emit to within that room.

Emit `chat:message_created` with the full new message object to everyone with access to that channel when a message is posted. If the channel is private, only emit to users who are members of that private channel, not the entire project room.

Emit `chat:message_updated` with the message ID and updated fields when a message is edited.

Emit `chat:message_deleted` with the message ID when a message is soft deleted.

Emit `chat:read_receipt_updated` with the user ID and their new `lastReadMessageId` when a user marks a channel as read, so other open clients can update seen-by indicators live without polling.

---

## Frontend — Chat Store

Create a dedicated Zustand store for chat state. It should hold the list of channels for the active project with their unread counts, the currently active channel ID, a map of channel ID to its loaded messages keyed in a way that supports appending older pages without re-sorting everything, and a map tracking which thread is currently open if any. Create actions for setting the channel list, adding a newly created channel, prepending older messages when an earlier page loads, appending a new live message, updating a message in place for edits, marking a message as deleted in place, and updating read receipt state.

Do not load entire channel history into this store at once. Only keep a reasonably bounded window of loaded messages per channel in memory and rely on the cursor-based endpoint to fetch further back as the user scrolls up, discarding the oldest loaded messages from memory if a channel has been scrolled through extensively in a single session to avoid unbounded memory growth.

---

## Frontend — Chat Tab

Add Chat as a seventh tab in the project shell tab bar established in Sprint 6, positioned after Calendar and before Members, using the same tab styling already in place.

### Channel Sidebar
Within the Chat tab, show a narrow channel list on the left side of the tab's content area, distinct from the main workspace sidebar. List public channels the user has access to, then private channels the user is a member of, each as a row showing the channel name with a small lock icon for private channels. Show the unread count as a small badge on each channel row using the same numeric badge style described for the tab header badge, capping at nine with a plus sign beyond that.

A create channel button at the top of this list, visible only to Project Admin and Workspace Owner roles. Clicking it opens a small modal with a channel name input, an optional description textarea, a private toggle, and if private is toggled on, a member picker showing current project members to select as initial channel members.

### Message List
The main content area shows the active channel's messages in chronological order, oldest at the top, newest at the bottom, with the view scrolled to the bottom on initial load. Each message shows the author's avatar, name, a relative timestamp, the body text, and any attachments below the text. If the message has been edited show a small "edited" label in tertiary grey next to the timestamp. If the message has been deleted show a placeholder in place of the body such as "This message was deleted" in tertiary grey italic text instead of the original content.

Scrolling to the top of the currently loaded messages should trigger fetching the next older page using the cursor pagination endpoint, prepending the results without causing the scroll position to jump.

Only render messages that are within or near the visible scroll area using a windowing approach, the same general principle already specified for the board and list view in Sprint 9, since a channel could grow very large over the life of a project.

Each message shows a small reply count below it if it has thread replies, for example "3 replies." Clicking this opens the thread view.

### Thread View
Clicking reply on a message or clicking an existing reply count opens a thread panel. This can be a focused view within the same tab area, showing the parent message at the top and its replies below in chronological order, with its own input area at the bottom for posting further replies. Closing the thread view returns to the main channel message list.

### Message Input
A fixed input area at the bottom of the active channel view. A text area that expands as the user types, a file attachment button that opens the system file picker, and a send button. Pressing Enter sends the message, Shift plus Enter inserts a new line. Show selected files as small removable chips above the input before sending. Uploading attachments should show progress and the message should not send until attachments finish uploading, or alternatively send the message first and attach files as they complete, but be consistent and clear about which approach is used so the user is never confused about whether their message has actually been sent.

### Editing and Deleting
Hovering a message the current user authored reveals small edit and delete icon buttons. Clicking edit turns the message body into an editable text area in place, matching the inline editing pattern already used elsewhere in the application, such as the task title editing from Sprint 10. Pressing Enter saves the edit, Escape cancels. Clicking delete shows a small confirmation before soft deleting.

### Read Receipts
When the user scrolls to and views the latest message in a channel, call the mark-as-read endpoint with that message's ID. Show a small "Seen by" indicator below the most recent message in the channel, listing the avatars of members whose read position has reached that message, refreshing live as `chat:read_receipt_updated` events arrive. Do not show seen-by indicators on every single message, only on the most recent one in the channel, to avoid visual clutter and unnecessary computation.

---

## Definition of Done

This sprint is complete when all of the following are true:

- A Chat tab appears in the project shell and shows a channel list
- Project Admin and Workspace Owner can create public and private channels
- Private channel creators can add and remove specific members
- Messages can be sent with text and with file attachments
- Messages load using cursor-based pagination and scrolling up fetches older pages without losing scroll position
- Editing a message updates it in place and shows an edited label
- Deleting a message soft deletes it and shows a placeholder rather than removing it from the database
- Replying to a message creates a thread, visible via a reply count and openable into a focused thread view
- Read receipts work correctly using the single lastReadMessageId field per user per channel, with no per-message receipt rows anywhere in the schema
- The seen-by indicator on the latest message updates live across sessions via Socket.IO without a page refresh
- New messages, edits, and deletes all propagate live to every other connected client with access to that channel within about a second
- Private channel messages are never emitted to project members who are not members of that private channel
- A composite database index exists on channel ID and created date for the Message table
- No unbounded list endpoint exists anywhere in this sprint — every message list call is cursor-paginated with a hard maximum page size
- The chat store does not load or retain unbounded message history in memory
- No colors outside the black-to-white range appear anywhere in the chat UI

---

## Notes for Antigravity

Do not implement mentions, the at-all behaviour, task slash references, mute settings, or the chat tab unread badge logic in this sprint — these are explicitly deferred to the next sprint and depend on this sprint's foundation being solid first. Do not create a per-message, per-user read receipt table under any circumstances; the single lastReadMessageId field per channel membership is a deliberate scalability decision and must not be bypassed even if it seems simpler to add a receipts table later. Do not use offset-based pagination anywhere in this sprint's endpoints; every paginated list must use a cursor. Reuse the existing project Socket.IO room from Sprint 8 rather than building a new room-per-channel system; access control for private channels happens at the application level when deciding whether to emit an event to a given socket, not by maintaining a separate Socket.IO room per channel. Reuse the existing multipart upload handling pattern from the Sprint 7 task attachments endpoint for chat file uploads rather than building a second upload mechanism from scratch.
