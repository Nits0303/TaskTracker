# Sprint 12 — Dashboard (Stats API + Frontend)

## Goal
Build the complete dashboard page — the stats API endpoints on the backend and the fully interactive dashboard UI on the frontend. By the end of this sprint both the project-scoped and workspace-wide dashboard views must be working with role-based stat sets, live data from the database, and all the charts and visualisations designed during the planning phase. No real-time updates on the dashboard — it loads fresh data on mount and on manual scope switch.

---

## Guiding Principles

The dashboard is a read-heavy page. Every stat shown must come from efficient database queries — no loading all tasks into memory and counting in application code. Use Prisma's groupBy and count aggregations wherever possible. The dashboard must feel fast — skeleton loaders while data is in flight, instant scope switching by pre-fetching both scopes on mount. All charts and visualisations must stay strictly within the black-to-white monochromatic palette using only grey shades and opacity to differentiate data series.

---

## Backend — Dashboard Module

Create a `DashboardModule` inside `apps/api/src/dashboard`. Import the Prisma service. Protect all endpoints with the JWT auth guard. These endpoints are read-only — no mutations.

### Endpoints to Build

#### GET /workspaces/:slug/projects/:projectId/dashboard
Return all stats for the project-scoped dashboard. The response shape must include two top-level keys: `admin` and `member`. The `admin` key holds the full team-wide stats. The `member` key holds the personal stats for the authenticated user. The frontend will choose which set to render based on the user's role — but always return both so the frontend does not need to make two calls.

The `admin` object should include:

A `counts` object with four values: `total` as the total number of tasks in the project, `completed` as the count of tasks with status Completed, `inProgress` as the count with status InProgress, `overdue` as the count of tasks where the due date is in the past and the status is not Completed.

A `members` array where each entry represents a project member and includes their name, avatar initials, total tasks assigned to them in this project, and how many of those tasks are completed. Sort by total tasks descending.

A `statusDistribution` array with one entry per status showing the status name, the count of tasks in that status, and the percentage of total tasks that represents.

An `overdueList` array of up to eight overdue task objects each with the task ID, title, assignee name, and how many days overdue it is. Sort by most overdue first.

A `completionTrend` array representing the last fourteen days. Each entry has a date string and a count of tasks that were completed on that date — meaning their status was changed to Completed on that day. Use the ActivityEvent table filtered to StatusChanged events where the metadata new status is Completed to derive this data.

The `member` object should include:

A `counts` object with four values: `assigned` as total tasks assigned to the authenticated user in this project, `completed` as their completed task count, `inReview` as their tasks with status Review, `overdue` as their overdue tasks.

An `activityThisWeek` array with one entry per day for the last seven days. Each entry has a day label and a count of ActivityEvents where the actor is the authenticated user in this project on that day. This covers all action types — creates, updates, comments, attachments.

#### GET /workspaces/:slug/dashboard
Return the same shape as above but scoped to the entire workspace. For the `admin` object aggregate stats across all projects in the workspace. For the `member` object aggregate the authenticated user's personal stats across all projects. Additionally include a `projectBreakdown` array inside the `admin` object where each entry has the project name, total task count, completed count, and overdue count — this lets the admin see per-project health at a glance.

---

## Backend — Query Optimisation

Both endpoints should use a single database round trip per major data shape where possible. Use `prisma.$transaction` to batch independent queries into one network call to the database. For example fetch task counts by status, overdue count, and member workload in a single transaction rather than three separate awaited calls. This ensures the dashboard loads fast even on large projects.

Cache both dashboard responses in Redis with a key of `dashboard:project:${projectId}:${userId}` and `dashboard:workspace:${workspaceSlug}:${userId}` with a TTL of sixty seconds. Invalidate the relevant cache key whenever a task is created, updated, deleted, or has its status changed in that project. The cache invalidation should be triggered from the task module after any mutating operation.

---

## Frontend — Dashboard Store

Create a Zustand store for dashboard data. It should hold the project dashboard response object, the workspace dashboard response object, the active scope which is either project or workspace, a boolean for whether the data is loading, and the timestamp of the last fetch. Create actions for setting both response objects and setting the active scope.

---

## Frontend — Dashboard Tab

Replace the Dashboard tab placeholder from Sprint 6 with the full dashboard implementation.

### Scope Toggle
At the top of the dashboard a full-width scope toggle with two options: This project and All projects. Switching scope changes which data is displayed. Both scopes should be fetched on initial mount so switching is instant with no loading state.

### Role Switcher
In the top right a smaller toggle between Admin view and Member view. For users with Member or Viewer roles this switcher should not appear — they always see the Member view. For Owner and Admin roles the switcher is visible and defaults to Admin view.

### Stat Cards Row
A row of four cards sitting side by side. For admin view the cards show Total tasks, Completed, In progress, and Overdue with their counts and sub-labels. For member view the cards show Assigned to me, Completed, In review, and Overdue.

Each card is a dark grey rectangle slightly lighter than the page background. The count is the largest text on the card in near-white. The label is smaller in secondary grey. The sub-label is the smallest in tertiary grey. No colored backgrounds on any card.

While loading show skeleton cards — dark grey rectangles with a subtle shimmer animation using only grey shades.

### Admin — Member Workload Section
Below the stat cards a section titled "Team breakdown" in small uppercase tertiary grey. A list of member rows. Each row has an avatar circle with initials on the left, the member name in the middle, a fraction showing completed out of total on the right, and a slim progress bar below spanning the full row width. The progress bar fill is near-white. The track is a dark grey. Members with zero tasks assigned show a completely empty track.

### Admin — Status Distribution Section
A section titled "Status distribution". For each of the four statuses show a row with the status name on the left as a text badge using only grey shades, the task count and percentage on the right, and a horizontal progress bar filling from left to right. The four bars should use different grey opacities to distinguish them — for example Completed at full opacity near-white, In Progress slightly dimmer, Review dimmer still, To Do at the darkest fill.

### Admin — Completion Trend Chart
A section titled "Completion trend — last 14 days". A simple bar chart with fourteen bars representing the last fourteen days. The x-axis shows abbreviated day and date labels. The y-axis is unlabeled — just implicit from bar height. Taller bars mean more tasks completed that day. Bars are near-white fill on a dark grey track. Zero-count days show a minimal bar height so the chart area is always visible. Do not use an external charting library — build this as a simple SVG bar chart with inline calculations. Keep it lightweight.

### Admin — Overdue Tasks Section
A section titled "Overdue tasks". A grid of small pill badges each representing an overdue task. Each pill shows the task title truncated, the assignee initials, and how many days overdue. Clicking a pill opens the task slide-over panel. Pills are styled with a dark grey background and a subtle border — no red, stay monochromatic. If there are no overdue tasks show a small success message saying "All tasks are on track."

### Admin — Project Breakdown (Workspace Scope Only)
When the workspace scope is active add a project breakdown table below the overdue section. Columns: project name, total tasks, completed, overdue, and a slim progress bar showing completion percentage. Each row is clickable and navigates to that project's dashboard.

### Member — Activity Chart
For the member view below the stat cards show a section titled "My activity this week". A seven-bar chart using the same SVG approach as the admin completion trend chart but with seven bars for the last seven days. Each bar represents the total number of actions the user took that day across all event types. The day labels on the x-axis show Mon through Sun or the date if the current week spans two months.

---

## Frontend — Skeleton Loading

Every section of the dashboard has a corresponding skeleton state. Skeleton elements are dark grey rectangles that pulse with a subtle opacity animation — from the section background shade up two steps and back. The pulse cycle is approximately one and a half seconds. Skeletons must match the approximate size and shape of the real content they are replacing so the layout does not shift when data arrives.

---

## Frontend — Refresh Behaviour

Add a small refresh icon button in the top right of the dashboard next to the role switcher. Clicking it clears the store and re-fetches both scopes from the API. Show a brief spinning animation on the icon during the fetch. The dashboard does not auto-refresh — it is always on-demand or on mount.

When the scope toggle is switched if the target scope data is already in the store and was fetched within the last sixty seconds use the cached store data without an API call. If it is older than sixty seconds re-fetch silently in the background and update the store when the response arrives.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The Dashboard tab loads project stats from the API on mount
- The workspace scope loads workspace-wide stats correctly
- Switching scopes is instant when both are pre-fetched
- Admin view shows stat cards, member workload, status distribution, completion trend chart, and overdue tasks
- Member view shows personal stat cards and the activity chart
- Member and Viewer role users only see the Member view with no role switcher visible
- Skeleton loaders match the shape of the real content and do not cause layout shift
- The completion trend chart renders as an SVG bar chart with fourteen bars
- The member activity chart renders as an SVG bar chart with seven bars
- Clicking an overdue task pill opens the task slide-over panel
- The project breakdown table appears in workspace scope admin view and rows navigate correctly
- The refresh button clears and re-fetches both scopes
- Redis caching is in place with sixty second TTL and cache invalidation on task mutations
- No external charting library is installed
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

Do not install recharts, chart.js, d3, or any other charting library. The completion trend and activity charts are simple bar charts that can be built as lightweight inline SVG with vanilla calculations — the complexity does not justify a library dependency. Use Prisma transactions to batch database queries — never make more than two sequential awaited database calls per endpoint. The dashboard cache invalidation in the task module should be a simple Redis DEL call on the relevant key after any task mutation — keep it synchronous since it is just a cache key deletion, not a heavy operation.
