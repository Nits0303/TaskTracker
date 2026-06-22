# Sprint 23 — Direct Messages (Core Infrastructure, Sidebar Restructure, Search Integration)

## Goal
Add direct messaging between any two workspace members, independent of any project. Restructure the workspace sidebar so the standalone Members navigation link is removed, the Projects list becomes a capped, independently scrollable list, and a new Direct Messages list appears below it sorted by conversation recency. Extend global search so members can be found by name and a conversation started directly from a search result. This sprint delivers a fully working but visually plain direct-messaging experience — text and attachments send and display correctly, typing indicators work, and a simple read receipt appears. Rich image and file preview treatments, message replies, mentions, and mute are explicitly deferred to the next sprint.

---

## Guiding Principles

A direct message conversation is not a new parallel system — it is the existing Channel and Message infrastructure from Sprint 20 and Sprint 21, used in a workspace-scoped mode instead of a project-scoped one. Every piece of that infrastructure that already works — cursor pagination, soft-delete with edited and deleted placeholders, attachment uploads, the realtime gateway's emit pattern — must be reused as-is. A direct conversation is created lazily, only at the moment the very first message is actually sent, never the moment a member is clicked. The sidebar itself must never scroll as a single unit; only the Projects list and the Direct Messages list scroll independently within their own bounded regions. The entire feature stays strictly within the black-to-white monochromatic palette established in Sprint 1.

---

## Backend — Database Changes

Make the `projectId` field on the existing Channel model nullable, since a direct-message channel belongs to no project. Add a required `workspaceId` field to the Channel model so every channel — project-scoped or direct — can be queried directly by workspace without joining through a project, which matters for direct channels that have no project to join through. Add a `type` enum field to the Channel model with two values representing a regular project channel and a direct conversation, so every existing query and guard in the system can branch on this cleanly.

To guarantee that at most one direct conversation can ever exist between any two given users within a workspace, do not rely on a simple "does a channel already exist between these two" lookup at write time alone — that is race-prone under concurrent first-message sends. Instead, for direct-type channels, store both participants' user IDs directly on the Channel record in two dedicated fields, always assigning whichever of the two user IDs sorts first to the first field and the other to the second field, regardless of who initiated the conversation. Place a unique compound database index across the workspace ID and both of these ordered participant fields. This database-level constraint is the actual guarantee against duplicate direct channels, not application logic.

The ChannelMember, Message, and MessageAttachment models require no structural changes — they already reference a channel by ID and will continue to work transparently for direct-type channels.

Run this migration under the name `add-direct-messages`.

---

## Backend — Chat Module Extensions

Extend the existing chat module from Sprint 20 rather than creating a new module.

### Conversation List

#### GET /workspaces/:slug/conversations
Return every direct-type channel the authenticated user participates in. For each one include the other participant's name, avatar, and current presence status reusing the Sprint 19 presence service, a preview of the most recent message — its truncated text, or a label such as "Sent an attachment" if the most recent message has no body text — the timestamp of that most recent message, and the authenticated user's unread count for that conversation computed the same way unread counts are already computed for channels via `lastReadMessageId`. Sort the list by the most recent message timestamp, descending.

### Sending the First and Subsequent Messages

#### POST /workspaces/:slug/conversations/messages
This single endpoint powers both the very first message in a new conversation and every message after that, which is what makes lazy creation work. Accept either an existing channel ID, for conversations that already exist, or a target user ID, for conversations that do not yet exist. When a target user ID is provided and no direct channel between the authenticated user and that target already exists in this workspace, create the Channel record and both ChannelMember records in a single transaction immediately before creating the message itself, then return the channel together with the created message. When a channel already exists, simply create the message against it as normal. Reuse the same body, optional parent message, and attachment handling already built for channel messages in Sprint 20.

#### GET /workspaces/:slug/conversations/:channelId/messages
Identical cursor-based pagination behavior to the existing channel messages endpoint from Sprint 20 — reuse it directly, only the access check differs as described below.

#### PATCH /workspaces/:slug/conversations/:channelId/read
Identical mechanism to the existing channel read endpoint from Sprint 20, operating on a direct-type channel.

### Access Control

For a direct-type channel, access is granted only to the two users stored as its participants. Extend the existing message edit and delete endpoints from Sprint 20 so that, when the target channel is direct-type, authorization checks participancy on the channel instead of project membership — the rest of their logic, including the soft-delete and edited-flag behavior, stays exactly as already implemented.

---

## Backend — Socket.IO Extensions

Reuse the personal Socket.IO room pattern, `user:${userId}`, already established in Sprint 13 and Sprint 15, for all direct-message delivery — direct messages are never scoped to a project room.

Reuse the existing `chat:message_created`, `chat:message_updated`, `chat:message_deleted`, and `chat:read_receipt_updated` events from Sprint 20 and Sprint 21 exactly as they are, emitting them to both participants' personal rooms instead of a project room when the channel is direct-type.

Add two new events, `chat:typing_start` and `chat:typing_stop`, carrying the channel ID. When the authenticated user emits one of these in a direct conversation, store their typing state in Redis keyed by that channel ID with a short, continuously-refreshed TTL, following the exact same self-expiring pattern already used for task comment typing in Sprint 19, then broadcast the update to the other participant's personal room only.

---

## Frontend — Sidebar Restructure

Remove the standalone Members navigation link that currently sits below Home.

Below the existing Projects section, add a new section labeled "Messages" using the same small uppercase tertiary-grey section-label style already used for "Projects". Cap the Projects list itself to a maximum of three visible rows; if there are more than three projects, that list becomes its own independently scrollable region, with the rest of the sidebar unaffected. Apply the identical pattern to the new Messages list, capped to five visible rows before it becomes its own independently scrollable region. The sidebar as a whole must never scroll as a single unit — only these two bounded regions ever scroll.

Populate the Messages list from the conversations endpoint above, which already returns results sorted by recency. Each row shows the other participant's avatar with their live presence status dot reused from Sprint 19, their name, the truncated last-message preview, a relative timestamp, and an unread count badge using the same numeric badge style already used elsewhere in the application, capped the same way. Clicking a row navigates to that conversation.

If the authenticated user has no conversations yet, show a small line of text under the Messages section heading suggesting they search for a member to start one.

---

## Frontend — Direct Messages Page

Add a new route at `/w/:slug/messages/:userId`, rendered inside the existing persistent sidebar shell layout — the sidebar stays exactly as it is on every other route, and this page renders in the main content area.

The page header shows the other participant's avatar, name, and a presence status line — "Active", "Away", or a relative last-seen time when offline, reusing the exact logic and tooltip pattern already built for the sidebar in Sprint 19.

The message list below the header follows the same structural pattern already built for channel messages in Sprint 20 — author avatar, relative timestamp, body text, edited label when applicable, deleted placeholder when applicable, attachments rendered with the same generic file-name-and-download treatment already used for plain attachments elsewhere in the application. Reuse the same cursor pagination, scroll-position preservation when loading older messages, and scroll-to-bottom-on-initial-load behavior already specified for channels — do not rebuild any of this.

Show the text "Seen" in tertiary grey directly beneath the authenticated user's most recently sent message once the other participant's read position has reached or passed it, updating live as `chat:read_receipt_updated` events arrive, with no indicator shown until that happens.

Show a typing indicator line just above the message input reading "[Name] is typing…" in tertiary grey whenever the other participant is actively typing, appearing and disappearing smoothly based on the new typing events, and self-clearing even if no explicit stop event ever arrives, consistent with the TTL-based approach from Sprint 19.

The message input follows the same composer pattern already built in Sprint 20 — an auto-expanding textarea, an attachment button opening the file picker, a send button, Enter to send and Shift+Enter for a new line. No reply functionality, mention functionality, or special image and file preview treatment is built in this sprint — attachments upload and render using the same plain, generic file-name-and-download presentation already used for ordinary attachments elsewhere, regardless of file type.

If the page is visited for a user with no existing conversation yet, render an empty message list with just the header and a ready composer. Sending the first message is what actually creates the conversation, per the lazy-creation endpoint above, and it should then immediately appear in both participants' sidebar Messages lists in real time.

---

## Frontend — Global Search Integration

Extend the existing Sprint 22 global search endpoint and its dropdown component — do not build a second search experience. Add Member as a fourth result type, matching against member name and email within the active workspace, merged into the same single ranked, capped result list already returned by the search endpoint.

Member rows in the dropdown show a small "Member" label, the person's avatar, name, and live presence status dot. Selecting a Member result closes the dropdown, clears the input, records the query into recent searches exactly as the other result types already do, and navigates directly to that member's `/w/:slug/messages/:userId` route.

---

## Edge Cases

A user must never be able to start a conversation with themselves — exclude the authenticated user from their own member search results and from any member-selection affordance.

If a conversation's other participant is later removed from the workspace, keep the conversation and its full history visible to the remaining participant, but disable sending new messages to them until and unless they rejoin, with the composer showing a clear inactive state rather than silently failing.

Two participants sending their first message to each other at nearly the same moment must still resolve to a single direct channel, never two — this is what the database-level unique compound index exists to guarantee, not application-level checking.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The `add-direct-messages` migration runs cleanly and the unique compound index prevents duplicate direct channels between the same pair of users even under concurrent attempts
- The Members navigation link is gone from the sidebar
- The Projects list is capped at three visible rows with its own independent scroll, and the Messages list is capped at five visible rows with its own independent scroll, while the sidebar itself never scrolls as a whole
- The Messages list is sorted by conversation recency and shows correct unread badges and presence dots
- Visiting a new conversation's URL shows an empty, ready composer with no channel created yet
- Sending the first message creates the channel and both memberships transactionally and the conversation appears for both participants' sidebars in real time
- Text and attachment messages send and display correctly using the existing generic attachment presentation
- Editing and deleting a direct message work through the existing Sprint 20 endpoints, now authorized by participancy
- The "Seen" indicator appears correctly and updates live
- The typing indicator appears, disappears, and self-clears correctly via the Redis TTL pattern
- Global search returns Member results and selecting one navigates straight into the conversation
- No colors outside the black-to-white range appear anywhere in this sprint's UI

---

## Notes for Antigravity

Do not create a parallel DirectMessage or DirectConversation model — direct conversations are Channel records with no project and a direct type flag, reusing Message, MessageAttachment, and ChannelMember exactly as they already exist. Do not implement message replies, mentions, mute, or any image/file preview treatment beyond the existing plain attachment presentation in this sprint — all of that is explicitly deferred to the next sprint. Do not rely on a check-then-create pattern in application code to prevent duplicate direct channels; the unique compound database index is mandatory and is the real safeguard. Reuse the Sprint 19 presence components and the Sprint 20 message list, pagination, and composer components directly rather than rebuilding equivalents for this page. This sprint modifies the existing, already-implemented Sprint 22 search endpoint and dropdown component to add the Member result type — it does not introduce a second search UI.
