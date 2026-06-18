# Sprint 9 — Board Page (Kanban + List + Drag and Drop)

## Goal
Complete the Board tab into a fully polished, production-ready experience. By the end of this sprint the Kanban board must support drag and drop between columns and within columns, the list view must be fully sortable, all filters must work seamlessly across both views, and every interaction must feel smooth and instant via the optimistic update infrastructure from Sprint 8. No new backend endpoints in this sprint — everything builds on top of what Sprints 7 and 8 already deliver.

---

## Guiding Principles

The board is the most frequently used page in the entire application. It must feel fast. Every drag and drop action should update the UI before the API call completes using the optimistic update pattern from Sprint 8. If the API call fails the board should snap back to its previous state silently and show a toast. The board layout and card design must stay strictly within the black-to-white monochromatic palette — use subtle grey differences to communicate depth, priority, and status rather than colors.

---

## Drag and Drop — Library Choice

Use the `@dnd-kit/core` and `@dnd-kit/sortable` packages for drag and drop. Do not use react-beautiful-dnd as it is unmaintained. The dnd-kit library works correctly with React strict mode and does not cause double-render issues. Install both packages in `apps/web`.

---

## Kanban Board — Drag and Drop Implementation

Wrap the entire Kanban board in a `DndContext` from dnd-kit. Each column is a droppable area. Each task card is a draggable item.

### Dragging a Card Within a Column
When a card is dragged and dropped to a new position within the same column, update the sort order of all affected cards in the column. Optimistically reorder the cards in the Zustand store immediately. Then call the `PATCH /tasks/:taskId/reorder` endpoint with the new sort order array for the affected cards. If the call fails revert the store to the previous order.

### Dragging a Card Between Columns
When a card is dropped into a different column, that column represents a different task status. Optimistically update the task's status in the store and move it to the target column immediately. Then call the `PATCH /tasks/:taskId` endpoint with the new status. The status change will also emit a `task:status_changed` Socket.IO event to other users in the room per Sprint 8.

### Drag Overlay
While a card is being dragged show a drag overlay — a slightly opaque copy of the card that follows the cursor. The original card's slot in the column should show a subtle placeholder — a dashed grey border box the same size as the card to indicate where it came from. The column being hovered over should show a faint highlight on the drop area.

### Column Drop Indicator
When dragging a card over a column and hovering between two existing cards show a thin horizontal line between them indicating where the card will be inserted. This line should be a light grey — consistent with the monochromatic palette.

### Touch Support
Drag and drop should work on touch devices using dnd-kit's built-in pointer sensor. Add both the mouse sensor and the pointer sensor to the DndContext sensors array.

---

## Kanban Board — Column Design

Each column should be a fixed width with a minimum height so empty columns do not collapse. The column header has three elements: the status label on the left, the task count badge in the middle, and a progress bar spanning the full width below the header. The progress bar fill represents the percentage of tasks in that column that have sub-tasks completed — if a column has no tasks with sub-tasks show the bar as empty.

The column body is a scrollable area. If a column has more tasks than fit in the viewport the column scrolls independently without affecting other columns. The add task button is pinned to the bottom of the column above the scroll boundary so it is always visible.

Columns should not be reorderable — the four statuses always appear in the fixed order: To Do, In Progress, Review, Completed.

---

## Task Card — Final Design

This is the definitive task card design for the application. It must match the design decided during planning:

The card is a dark grey rectangle with a very subtle border. On hover the border brightens slightly. A card that is being dragged has reduced opacity.

The top section shows the task title in near-white text. Long titles truncate to two lines with an ellipsis.

The bottom section is a single row with three elements spaced apart: the priority badge on the left, the due date in the middle, and the assignee avatar on the right.

The priority badge uses text and border only — no background color fills. Urgent uses the brightest white text with a solid border. High uses slightly dimmer text with a solid border. Medium uses mid-grey text with a subtle border. Low uses dark grey text with a dashed border.

The due date shows the date in a short format. If the task is overdue — past due date and status is not Completed — show the due date text in a slightly lighter grey than normal and prepend a small clock icon. Do not use red. Stay monochromatic.

The assignee avatar is a small circle showing the member's initials. If there is no assignee show an empty dashed circle.

Below the title and above the bottom row, if the task has sub-tasks show a thin progress bar representing the sub-task completion ratio. This bar is very slim — two pixels tall. If there are no sub-tasks do not show the bar.

At the very bottom of the card, if the task has comments or attachments show a row of small icon-count pairs — a comment bubble icon with the count and a paperclip icon with the count. These should be very small and use tertiary grey text.

---

## List View — Final Design

The list view shows all tasks across all statuses in a single table. The table has the following columns in order: a drag handle icon, task title, status badge, priority badge, due date, assignee avatar, comment count, attachment count.

The drag handle column allows reordering rows within the same status group. Tasks of different statuses cannot be mixed in the list view reorder — dragging a row to a position occupied by a different status silently snaps it back.

Clicking any row opens the task slide-over panel.

The table header row is sticky so it stays visible when scrolling through many tasks.

The status badge in the list view uses the same text-and-border approach as the priority badge on cards — no background fills, just text color variation and border style within the grey palette.

Group the list view by status with a subtle group header row before each status section showing the status name and the count of tasks in that section. Group headers are not draggable.

---

## Filters — Final Implementation

The filter bar sits above the board and is always visible. It contains four dropdowns: Priority, Assignee, Due date, and Label. Next to the dropdowns show an active filter count badge if any filters are applied. Show a clear all button next to the badge that resets all filters at once.

All filtering is client-side against the task store. No additional API calls are made when filters change. Filters apply to both Kanban and List views simultaneously — switching views while filters are active keeps the filters.

Save the active filter state to the project's entry in localStorage so filters persist across page refreshes for that project.

When filters are active and a column in Kanban view has zero visible tasks, show the column with the empty state — a subtle message saying no tasks match the current filters. Do not hide the column entirely.

---

## View Toggle — Final Implementation

The view toggle sits in the top right of the board header. It shows two icon buttons: one for Kanban and one for List. The active view button has a slightly lighter background. Switching views is instant — no loading state because the data is already in the store.

Save the active view preference per project in localStorage. When the user returns to a project board they see their last used view.

---

## New Task Creation — Final Implementation

### Inline Column Form
Clicking the add task button at the bottom of a Kanban column opens a small inline form inside that column. The form has a single title input that is auto-focused. Below the input a row of quick-set controls: a priority selector showing a small badge that cycles through priority levels on click, an assignee selector showing a small avatar picker, and a due date button that opens a minimal date picker. A save button and a cancel button.

Pressing Enter in the title input saves the task. Pressing Escape cancels and closes the form. Clicking outside the form cancels it.

On save create the task optimistically — add it to the store immediately with a temporary ID, render the card, then call the API. On API success replace the temporary ID with the real one from the server response. On failure remove the card from the store and show a toast.

### Full Create Form
The project header create task button opens the slide-over panel in create mode. Show all fields: title, description, status selector, priority selector, assignee selector, due date picker, label input, start time, and end time. A create button and a cancel button. On create the panel switches to the view mode of the newly created task.

---

## Empty State

When a project has no tasks at all show a full board empty state centered in the main content area. A large heading saying the board is empty, a sub-heading suggesting creating the first task, and a single prominent create task button. This state should only show when there are truly zero tasks — once any task exists show the columns normally even if some are empty.

---

## Performance Considerations

If a project has more than one hundred tasks the Kanban board should not render all cards at once. Implement windowing on each column using a simple approach — only render cards that are within or near the visible scroll area of the column. Use an intersection observer to load cards as the user scrolls within a column. This prevents DOM bloat on large projects.

For the list view use a similar approach — virtualise the rows using a windowing strategy so only visible rows are in the DOM at any time.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Dragging a card between columns updates its status in the database and in the stores of all other connected users via Socket.IO
- Dragging a card within a column updates the sort order in the database
- The drag overlay shows while dragging and the placeholder shows in the origin slot
- A drop indicator line appears between cards when hovering during a drag
- The list view groups tasks by status with group headers
- List view rows are reorderable within their status group via drag handle
- Filters work client-side in both views and persist in localStorage
- The view preference persists in localStorage per project
- The inline column form creates tasks optimistically with rollback on failure
- The full create form in the slide-over opens correctly and creates the task
- Empty state shows when there are no tasks
- Column empty state shows correct message when filters hide all tasks in a column
- Cards render with the correct priority badge style, due date indicator, sub-task bar, and comment and attachment counts
- Overdue tasks show the due date with a clock icon in a lighter grey — no red
- Performance windowing is in place for columns and list view with over one hundred tasks
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

Do not install react-beautiful-dnd. Use only dnd-kit. The drag and drop implementation must work with the optimistic update pattern already in place from Sprint 8 — do not bypass the Zustand store by directly mutating component state during drag. The status change from drag must go through the same store action that the Socket.IO `task:status_changed` event uses — this ensures both sources of status changes follow the same code path. The card design finalized in this sprint is the definitive version used for the rest of the project — do not change card layout in future sprints without updating this component.
