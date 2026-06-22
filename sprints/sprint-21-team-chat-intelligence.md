# Sprint 21 — Team Chat Intelligence Layer (Mentions, Task References, Mute, Unread Badge)

## Goal
Build the smart layer on top of the core chat system from Sprint 20. By the end of this sprint users can mention specific people or everyone in a channel, reference existing non-completed tasks inline using a slash command that links directly to the task panel, mute channels or an entire project's chat for a set duration, and see an accurate unread badge on the Chat tab that respects mute settings except for the specific cases defined below where notifications must always break through. This sprint depends entirely on the channel, message, and read receipt infrastructure built in Sprint 20 — do not rebuild or duplicate any of that, only extend it.

---

## Guiding Principles

Mute is never absolute. The whole point of this sprint is a precise exception system: being muted should stop general noise, but specific, personally relevant signals must still surface. Get the exact bypass rules right, since this is the most nuanced part of the entire chat feature and the most likely place for subtle bugs if implemented loosely.

Stay within the existing stack. No new infrastructure. Reuse the Sprint 19 presence system for the at-all behaviour, and reuse the Sprint 20 message and channel models for mentions and task references — these are additions to existing data, not new parallel systems.

---

## Backend — Database Changes

Add a `mentions` field to the `Message` model from Sprint 20 as a JSON array, storing the structured list of mentions found in that message at the time it was sent. Each entry should record the mention type, which is one of user, all, or task, and the relevant target ID — a user ID for a user mention, nothing additional needed for an all mention, and a task ID for a task reference. Storing this at write time avoids needing to re-parse message text every time mentions need to be checked later. Run a migration named `add-message-mentions`.

Add a `ChannelMute` model. Store the user ID, the channel ID, and a `mutedUntil` nullable datetime. If `mutedUntil` is null but a row exists, treat this as muted forever until explicitly unmuted. If `mutedUntil` is in the past, treat the channel as not muted and treat the row as stale, to be cleaned up or simply ignored by the query rather than requiring an active cleanup job. The combination of user ID and channel ID must be unique.

Add a `ProjectChatMute` model with the same shape but scoped to a project ID instead of a channel ID, representing the project-wide mute-all-channels option. Store the user ID, project ID, and `mutedUntil` nullable datetime with the same semantics as above.

When determining whether a given channel is currently muted for a user, check both tables — a channel is effectively muted if either the specific `ChannelMute` row is active or the `ProjectChatMute` row for that project is active.

---

## Backend — Mention Parsing and Resolution

Create a mention parsing utility that runs on the server when a message is created or edited. It should detect three patterns in the message body: an at-symbol followed by a username referring to a specific project member, the literal text at-all, and a forward slash followed by text referring to a non-completed task in the project. For user and all mentions, this utility resolves the username text to an actual user ID by matching against project members. For task references, resolve the typed text against non-completed task titles in the project, matching by closest text match if an exact match is not found, consistent with the autocomplete-with-fallback behaviour described below for the frontend. Store the resolved structured mentions array on the message as described above. If a piece of text looks like a mention or task reference but cannot be resolved to a real user or a real non-completed task, do not store it as a mention — treat it as plain text so the system never sends a notification for something that does not actually exist or resolve.

---

## Backend — Mute Endpoints

#### PATCH /workspaces/:slug/projects/:projectId/channels/:channelId/mute
Mute a channel for the authenticated user. Accept a duration value that is one of one hour, one day, or forever. Calculate and store the corresponding `mutedUntil` value, or null for forever. Create or update the `ChannelMute` row for this user and channel. Return the updated mute state.

#### DELETE /workspaces/:slug/projects/:projectId/channels/:channelId/mute
Unmute a channel. Delete the `ChannelMute` row for this user and channel.

#### PATCH /workspaces/:slug/projects/:projectId/chat/mute
Mute the entire project's chat for the authenticated user, meaning every channel in that project, using the same three duration options. Create or update the `ProjectChatMute` row.

#### DELETE /workspaces/:slug/projects/:projectId/chat/mute
Unmute the entire project's chat for the authenticated user.

#### GET /workspaces/:slug/projects/:projectId/chat/mute-status
Return the authenticated user's current mute state for this project, including the project-wide mute status and a per-channel breakdown, so the frontend can render mute indicators correctly across the channel list without separate calls per channel.

---

## Backend — Notification and Badge Logic

This is the most important section of this sprint. Implement the unread and notification logic precisely as follows.

When a new message is created, determine for every project member other than the author whether this message should count toward their unread badge and whether it should trigger a live notification, using these rules in order:

If the message contains an at-mention of that specific user, it always counts and always notifies, regardless of any mute setting on the channel or the project.

If the message contains an at-all mention, it always counts and always notifies for every project member except the author, regardless of mute settings, but the live delivery timing depends on presence — for members who are currently Active or Away per the Sprint 19 presence system, emit the notification immediately. For members who are currently Offline, do not attempt to push it live; simply ensure the unread count and the stored message are correctly reflected so the badge and the message are accurate whenever that member next comes online and fetches the channel.

If the message contains a task reference and the authenticated user reading this logic is the assignee of that referenced task, it always counts and always notifies regardless of mute settings, identical in priority to a direct at-mention. If the user is not the assignee of that referenced task, this rule does not apply, and the message falls through to the next rule as if it contained no task reference relevant to them.

For every other case, meaning a plain message with no relevant mention or task reference for this particular member, check whether the channel or the project is muted for that member. If muted, the message does not increment their unread badge and does not trigger a live notification for them, though it is still stored normally and will appear in the channel history whenever they next open it. If not muted, the message increments their unread badge normally and triggers a live notification.

Apply this same logic independently per recipient, since a single message might bypass mute for one mentioned user while being correctly suppressed for everyone else in a muted channel.

---

## Backend — Socket.IO Updates

Extend the `chat:message_created` emission from Sprint 20 to include the resolved mentions array on the message payload, so the frontend does not need to re-parse anything client side.

Add a `chat:badge_update` event emitted to a specific user's personal room, established back in Sprint 13, whenever their unread count for a channel or for the Chat tab as a whole changes, carrying the new count. This allows the Chat tab badge to update instantly without the frontend needing to recompute it from scratch on every incoming message.

---

## Frontend — Mention and Task Reference Composer

In the message input area built in Sprint 20, detect when the user types an at-symbol and show a small autocomplete popover listing project members, filtering as they continue typing, plus an all option at the top of the list representing the at-all mention. Selecting an entry inserts the formatted mention into the text.

Detect when the user types a forward slash and show a similar autocomplete popover, but listing non-completed tasks in the current project, filtering by title as they type. If the user keeps typing past what the dropdown shows without selecting an entry, fall back to treating whatever text follows the slash as a plain text task reference attempt, which the backend will then try to resolve by closest match when the message is sent, consistent with the backend behaviour described above.

Visually distinguish an inserted mention or task reference from plain text in the input, for example with a subtle background highlight, so the user can see clearly what will become a clickable or notifying element before they send the message.

---

## Frontend — Rendering Mentions and Task References in Messages

When rendering a sent message in the channel, render any at-mention of a specific user as a distinct inline element using a slightly brighter text treatment within the monochromatic palette, not a color, so mentions are visually distinguishable from surrounding text without breaking the design system. Render at-all the same way. Render a resolved task reference as a clickable inline link in the same brighter treatment. Clicking it opens the task detail slide-over panel for that task directly from within the chat tab, reusing the existing task panel component rather than building a second one.

If a task reference could not be resolved to a real task by the backend, it was never stored as a mention in the first place, so it simply renders as plain text exactly as the user typed it, with no special styling and no click behaviour.

---

## Frontend — Mute Controls

Add a small mute icon button in the channel header next to the channel name, and a separate project-wide mute control accessible from the Chat tab's channel sidebar header area. Clicking either opens a small popover with the three duration options — one hour, one day, and forever — plus an unmute option if currently muted. Show a clear visual indicator on a muted channel's row in the sidebar, such as a dimmed channel name with a small muted icon, and show the project-wide mute state distinctly if it is the project-wide mute in effect rather than a per-channel one, since a user should be able to tell the difference between "I muted this one channel" and "I muted everything in this project."

If a channel is individually muted but the project-wide mute is also active, the project-wide mute should still be visually indicated as the broader setting, and unmuting the individual channel while the project-wide mute remains active should not cause that channel's notifications to resume, since the project-wide mute still applies. Make sure the frontend's displayed state always reflects this combined logic rather than only tracking one layer at a time.

---

## Frontend — Chat Tab Unread Badge

Update the Chat tab in the project shell tab bar to show a numeric badge representing the authenticated user's total unread count across all channels in this project, capped at nine with a plus sign for anything higher, matching the numeric badge style already used elsewhere in the application such as the notification bell from Sprint 15.

This badge must update live as `chat:badge_update` events arrive, without requiring the user to open the Chat tab or refresh the page. When the user opens a channel and reads its latest message, triggering the existing mark-as-read endpoint from Sprint 20, the badge should decrease accordingly to reflect only the channels still containing unread messages relevant to them under the mute rules above.

In the channel sidebar within the Chat tab, also show the same per-channel numeric badge on each channel row as already specified in Sprint 20, but now make sure this number correctly excludes messages that were suppressed by mute, while still including any message that bypassed mute due to a direct mention, an at-all, or an assigned task reference, even within an otherwise muted channel.

---

## Edge Cases to Handle

A message can contain more than one type of mention at once, for example mentioning a specific person and also referencing a task in the same message. Each relevant recipient's notification eligibility must be evaluated independently against everything the message contains, not just the first mention type found.

If a user is removed from a project or a channel after a mute setting was configured, do not error or crash when computing badge logic for them going forward; simply stop counting messages for someone no longer able to access the channel.

If the same user is mentioned multiple times in a single message, this should not cause duplicate notifications or double-counted unread increments — deduplicate mentions per message per recipient.

An at-all mention authored by a user should never notify or count toward that author's own unread badge.

A task reference to a task that is later marked complete after the message was already sent and stored should not retroactively change whether that historical message bypassed mute at the time it was sent — the bypass decision was already made and delivered at send time and should not be recalculated afterward.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Typing an at-symbol in the message composer shows an autocomplete of project members plus an all option
- Typing a forward slash shows an autocomplete of non-completed tasks, falling back to text matching if the user types past the dropdown
- Sent messages render mentions and task references with a distinct visual treatment within the monochromatic palette
- Clicking a rendered task reference opens the task detail panel for that task
- A channel can be muted for one hour, one day, or forever, and unmuted at any time
- A project's entire chat can be muted the same way, independently of individual channel mutes
- A direct at-mention always notifies and counts toward the badge regardless of mute state
- An at-all mention always notifies Active and Away members immediately and is correctly reflected for Offline members when they return, regardless of mute state
- A task reference only bypasses mute for the specific user who is the assignee of that referenced task, not for any other member
- All other messages in a muted channel or muted project correctly do not notify or increment the badge for the muted user, while still being stored and visible in history
- The Chat tab badge shows an accurate live numeric unread count capped at nine with a plus sign, updating without a page refresh
- Per-channel unread badges in the channel sidebar are also accurate and update live
- No duplicate notifications occur from a message mentioning the same user more than once
- No colors outside the black-to-white range appear anywhere in this sprint's UI

---

## Notes for Antigravity

Do not modify or rebuild anything from Sprint 20's core channel, message, or read receipt infrastructure — this sprint only adds mentions, task references, mute, and badge logic on top of it. Do not create a per-message notification log table; badge counts should be derived from existing read receipt state plus the mute and mention bypass rules computed at read time or at message creation time, not from a separate persisted notification history specific to chat. The mention parsing and resolution logic must run once at message creation or edit time and be stored on the message, not re-parsed from raw text every time a client renders it. Reuse the existing task detail slide-over panel component when a task reference is clicked rather than building a second task viewer. Reuse the Sprint 19 presence state when deciding at-all delivery timing rather than introducing a separate online tracking mechanism.
