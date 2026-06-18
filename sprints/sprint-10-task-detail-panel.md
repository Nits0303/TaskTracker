# Sprint 10 — Task Detail Panel (Sub-tasks, Comments, Attachments)

## Goal
Complete the task detail slide-over panel into a fully polished, production-ready experience. Sprint 7 built the panel structure and wired it to the API. Sprint 8 added real-time comment and sub-task sync. This sprint finalises every interaction inside the panel — inline editing feel, comment threading UX, attachment upload experience, sub-task management, and all the micro-interactions that make the panel feel professional. No new backend endpoints in this sprint — everything uses what Sprint 7 already built.

---

## Guiding Principles

The task detail panel is where users spend the most focused time in the application. Every interaction must feel deliberate and smooth. Inline editing should feel like editing a document — click, type, done. Comments should feel like a chat thread. Attachments should feel like dropping files onto a desk. All of this within the strict black-to-white monochromatic palette.

---

## Panel Shell — Final Polish

The panel slides in from the right with a smooth ease-out transition taking approximately two hundred milliseconds. It should not feel sluggish or snappy — aim for the same feel as a drawer opening in Linear or Notion. The panel width should be four hundred pixels on standard screens. On screens narrower than nine hundred pixels the panel should take the full width.

The area behind the panel should dim with a very subtle dark overlay — not a full modal blackout, just enough to draw focus to the panel. Clicking the dimmed area closes the panel.

The panel header is fixed and does not scroll with the content. It contains the live indicator dot on the far left, a breadcrumb showing the project name and task ID in a short format on the left, a copy link icon button and a delete icon button on the right. The delete button is only visible to project Admins.

Below the header the four-tab navigation is also fixed. The tab bar does not scroll. Only the tab body content scrolls.

When switching between tabs the scroll position of each tab should be remembered independently. If the user scrolls down in Comments and switches to Info and back, the Comments tab should return to where they left off.

---

## Info Tab — Final Polish

### Title Editing
The task title at the top of the Info tab is a large heading. Clicking it transforms it into a full-width textarea that auto-expands with the content. The textarea should have no visible border — it should look like a heading that is now editable with a very subtle background shift to indicate edit mode. Pressing Enter saves and exits edit mode. Pressing Escape cancels and restores the original value. Clicking outside saves.

Show a character limit of two hundred for the title. Display a character count below the textarea only when the user is actively editing and only when they are within thirty characters of the limit.

### Field Rows
Each field row has a label on the left in tertiary grey text and the value on the right. The value is clickable to edit. When a field is in edit mode it gets a subtle background highlight within the row — no border, just a slightly lighter dark grey background.

Status field: clicking opens a small dropdown popover with the four status options. Each option shows the status name. The currently selected one has a checkmark. Selecting one closes the popover and saves immediately.

Priority field: same pattern as status — a small popover with the four priority options. Each shows the priority name with a visual indicator using only grey shades and border styles.

Assignee field: clicking opens a small member search popover. Show a search input at the top and a scrollable list of project members below. Each member shows their avatar initials and name. Clicking a member assigns them and closes the popover. A clear option at the top of the list allows removing the assignee.

Due date field: clicking opens a minimal inline date picker. Show a month grid with the current month. Navigate months with previous and next buttons. The selected date has a near-white background. Today's date has a subtle border. Clicking a date saves and closes the picker. A clear button removes the due date.

Label field: a simple text input that saves on blur or Enter.

Start time and end time fields: show a time picker when clicked. These are for calendar blocking. Show them as a pair labeled as time slot. If both are set show a formatted range like "Jun 10, 9:00 AM – 11:00 AM". If a time slot is set and an assignee exists a CalendarBlock exists in the backend — show a small calendar icon next to the time slot indicating the assignee's calendar is blocked.

Created date: read-only, formatted as a relative time with the absolute date on hover in a tooltip.

### Description
The description section sits below the field rows. Show a label saying Description. If there is no description show a placeholder text in tertiary grey saying "Add a description...". Clicking anywhere in the description area activates edit mode — the full text becomes a textarea. The textarea auto-expands with content. Save on blur. Cancel on Escape.

Support basic markdown rendering in the read state — bold, italic, inline code, and bullet lists. When in edit mode show the raw markdown. When in read mode render it. Use a lightweight markdown parser — do not install a heavy library.

### Sub-task Progress Summary
Below the description a small section showing sub-task progress. A fraction showing completed out of total and a slim progress bar. Clicking this section jumps to the Sub-tasks tab.

---

## Sub-tasks Tab — Final Polish

### Layout
The tab header shows the completion fraction and a prominent add sub-task button on the right.

Each sub-task row has five elements in a single line: a drag handle on the far left for reordering, a checkbox, the title text, the assignee avatar, and the due date. On the far right a delete icon that appears only on hover.

Completed sub-tasks should have their title text dimmed and struck through. They should drift to the bottom of the list — when a sub-task is checked it animates downward to join the completed section. Show a subtle divider between incomplete and completed sub-tasks if both exist.

### Inline Creation
Clicking the add sub-task button opens an inline form at the top of the list. A title input that is auto-focused. Below it a single row with an assignee avatar picker and a due date button — both optional. A save button and a cancel button. Pressing Enter saves. Pressing Escape cancels.

### Inline Editing
Clicking the title of an existing sub-task makes it editable inline with the same no-border style as the main task title. Clicking the assignee avatar opens the member popover. Clicking the due date opens the date picker. Changes save on blur.

### Reordering
Sub-tasks within the incomplete section are reorderable via drag handle using dnd-kit. Completed sub-tasks are not reorderable. The sort order is saved via the update sub-task endpoint.

---

## Comments Tab — Final Polish

### Comment Display
Each comment shows the author avatar on the left and the comment content on the right. The author name is in near-white text. The timestamp is in tertiary grey as relative time with absolute date on hover. The comment body text is in secondary grey.

Top-level comments that have replies show a replies toggle below the body text. The toggle text shows the count — "2 replies" for example. Clicking it expands the replies with a smooth height animation. Replies are indented with a thin left border line in dark grey.

Each comment has a hover state that reveals two small icon buttons: a reply icon and a delete icon. The delete icon only appears if the current user is the comment author or a project Admin.

### Real-Time Comment Appearance
When a new comment arrives via the `comment:added` Socket.IO event and the Comments tab is open the new comment should appear at the bottom of the list with a brief fade-in animation. If the tab is not open increment a small unread badge on the Comments tab label.

### Comment Input
The comment input area is fixed to the bottom of the Comments tab. It does not scroll away. A textarea with a placeholder. It auto-expands up to four lines before scrolling internally. Below the textarea a row with a submit button on the right and a cancel button next to it. The cancel button clears the textarea.

When replying to a comment show a small dismissable chip above the textarea showing the author being replied to — for example "Replying to Arjun S." with an X to cancel the reply context.

Submitting a comment should be optimistic — append the comment to the list immediately with the current user's details and a "sending" indicator, then confirm or roll back when the API responds.

### Empty State
If there are no comments yet show a centered empty state in the tab body — a small icon and text saying "No comments yet. Be the first to comment."

---

## Attachments Tab — Final Polish

### Upload Area
A drag-and-drop upload zone occupies the top portion of the tab. It shows an upload icon, the text "Drop files here or click to upload", and a subtext showing "Stored securely in MinIO". When a file is dragged over the zone it highlights with a slightly lighter border. When files are being dragged over the browser window but not yet over the zone show a subtle indication that the zone is available.

Clicking the zone opens the system file picker. Multiple file selection should be supported.

### Upload Progress
When a file is uploading show it as a pending row in the attachments list below the upload zone. The row shows the file name and a slim horizontal progress bar that fills as the upload progresses. The progress is estimated from the XHR upload progress event. On completion the progress bar disappears and the row shows the full attachment details.

If an upload fails show the row in an error state with a retry button and a remove button.

### Attachment List
Each completed attachment row shows a file type icon on the left, the file name, the file size in a human-readable format, the uploader name and relative upload time, a download button, and a delete button visible only to the uploader and project admins.

File type icons should be simple monochromatic glyphs — a document glyph for PDFs and generic files, an image glyph for images, a code glyph for source files. All in the same grey icon style as the rest of the UI.

Clicking a file name for image attachments should open a simple lightbox preview — a full-screen dark overlay with the image centered. Click outside or press Escape to close. Non-image files open via the download URL in a new tab.

### Empty State
If there are no attachments show a centered empty state with the upload icon and the text "No attachments yet. Drop a file above to get started."

---

## Keyboard Navigation

The panel should support the following keyboard shortcuts when it is open and focused:

Pressing Escape closes the panel. Pressing Tab cycles through the four tab labels. Pressing the number keys one through four when the panel header is focused switches to the corresponding tab. These shortcuts should not fire when the user is typing in an input or textarea inside the panel.

---

## Panel URL State

When a task panel is opened update the URL to include the task ID as a query parameter — for example `?task=abc123`. This means the panel state is shareable. When a user loads the page with this query parameter in the URL the panel should open automatically to that task after the project data loads. When the panel is closed remove the query parameter from the URL without a full navigation.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The panel opens and closes with a smooth slide animation
- Clicking the dimmed backdrop closes the panel
- The title edits inline with no visible border and saves on Enter or blur
- All field rows are editable inline via their respective pickers and popovers
- The description renders markdown in read mode and raw text in edit mode
- Sub-tasks can be created inline, edited inline, checked, reordered, and deleted
- Completed sub-tasks animate to the bottom and show struck-through dimmed text
- Comments display in threaded order with expandable reply threads
- New comments appear in real time via Socket.IO with a fade-in animation
- The unread comment badge increments when a comment arrives while the tab is not active
- The comment input is fixed to the bottom and supports reply context
- Files can be uploaded via drag-and-drop or file picker with progress tracking
- Failed uploads show an error state with a retry option
- Image attachments open in a lightbox preview on click
- The panel URL state syncs the task ID to the query parameter
- Opening a URL with a task query parameter opens the panel to that task automatically
- Keyboard shortcuts work correctly without firing inside inputs
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

Do not add any new backend endpoints in this sprint. Every interaction uses the endpoints from Sprint 7. The markdown renderer for the description field should be a lightweight custom implementation handling only bold, italic, inline code, and bullet lists — do not install marked, remark, or any other full markdown library as they are too heavy for this use case. The URL query parameter sync must use Next.js router's shallow navigation so the browser history is not polluted with every panel open and close. The dnd-kit reordering for sub-tasks should reuse the same pattern established in Sprint 9 for task card reordering — do not introduce a second drag-and-drop implementation.
