# Sprint 14 — Members Workload Page

## Goal
Build the complete members workload page — the backend stats endpoint and the fully interactive frontend table view. By the end of this sprint a user should be able to see every project member's task load and time slot bookings in a clean table, switch between project and workspace scope, filter by role, and immediately spot any member who is on leave or unavailable. No real-time updates on this page — it loads fresh on mount and on scope switch.

---

## Guiding Principles

The workload page is a planning and oversight tool. Admins use it to spot overloaded members and reassign tasks. Members use it to understand their colleagues' availability before making requests. The data must be accurate and fast — use efficient database queries with Prisma aggregations. The role-based visibility rules must be enforced on both the backend and the frontend — members see less detail than admins. All UI stays within the black-to-white monochromatic palette.

---

## Backend — Workload Module

Create a `WorkloadModule` inside `apps/api/src/workload`. Import the Prisma service. Protect all endpoints with the JWT auth guard.

### Endpoints to Build

#### GET /workspaces/:slug/projects/:projectId/workload
Return workload data for all members of the project. For each member return two shapes in the response — a full `admin` shape and a limited `member` shape — the same dual-shape pattern used in the dashboard sprint. The frontend picks which to render based on the authenticated user's role.

The `admin` shape for each member should include their user ID, full name, email, avatar initials, their role in the project, their account status which for now is either Active or OnLeave, the total number of tasks assigned to them in this project, the number of those tasks that are completed, the number of time slots booked meaning CalendarBlock records belonging to them linked to tasks in this project, the total hours booked calculated by summing the duration in hours of all their CalendarBlock records for the current week, the list of project names they belong to within the workspace, and a workload level derived field that is Low if they have fewer than eight tasks, Medium if they have eight to eleven, and High if they have twelve or more.

The `member` shape for each member should include only their user ID, full name, avatar initials, their role, their account status, the total tasks assigned, and the number of time slots booked. Completion rate and hours and project list are excluded from the member shape.

Sort the results by total tasks assigned descending so the most loaded members appear at the top.

#### GET /workspaces/:slug/workload
Return workload data for all members of the workspace. The shape is identical to the project endpoint but aggregated across all projects in the workspace. For the `admin` shape include the list of projects each member belongs to with per-project task counts. The `member` shape stays the same as the project version — total tasks and time slots only.

---

## Backend — On Leave Status

There is no dedicated leave management system in this application. The on leave status is a simple boolean field that a workspace Owner or Admin can toggle per member. Add a new endpoint to support this:

#### PATCH /workspaces/:slug/members/:userId/leave
Toggle the on leave status for a workspace member. Only Owner and Admin may call this. Accept a boolean field `onLeave` in the request body. This requires adding an `onLeave` boolean field defaulting to false to the WorkspaceMember Prisma model. Run a Prisma migration to add this field. Return the updated WorkspaceMember record.

The on leave status is workspace-scoped not project-scoped. A member marked as on leave in a workspace is treated as on leave in all projects within that workspace.

---

## Frontend — Workload Store

Create a Zustand store for workload state. It should hold the project workload response, the workspace workload response, the active scope which is either project or workspace, the active role filter value, and a loading boolean. Create actions for setting both response objects, setting the scope, and setting the role filter.

---

## Frontend — Members Tab

Replace the Members tab placeholder from Sprint 6 with the full workload implementation. This tab was previously labeled Members in the project shell — keep the tab label as Members but the content is the workload table.

### Page Header
The page header has two rows. The top row has the page title "Members" on the left and a scope toggle on the right with two options: This project and All projects. The second row has a role filter dropdown on the left — options are All roles, Owner, Admin, Member, Viewer — and a role view toggle on the right: Admin view and Member view. For Member and Viewer role users hide the view toggle and always show the Member view.

### On Leave Banner
If any member in the current filtered view has on leave status set to true show a slim banner directly below the header. The banner should list the names of all on leave members separated by commas and a message saying they are currently unavailable. Style it with a dark grey background and slightly lighter border — no red, stay monochromatic. If no members are on leave do not render the banner at all.

### Workload Table
The main content is a full-width table. The table has a sticky header row that stays visible when scrolling. The columns differ between admin and member views.

In admin view the columns are: Member (avatar with initials and full name), Role (badge), Tasks assigned (count with progress bar), Completed (count and percentage), Time slots booked (count with progress bar), Hours this week, Projects, and Status.

In member view the columns are: Member, Role, Tasks assigned (count with progress bar only, no percentage), Time slots booked (count with progress bar), and Status.

Every column header is clickable to sort the table by that column. Clicking the same header again reverses the sort direction. Show a small sort direction arrow icon next to the active sort column header. Default sort is by tasks assigned descending.

### Member Name Cell
Shows a small avatar circle with the member's initials on the left and their full name in near-white text to the right. In admin view show their email address below the name in tertiary grey smaller text.

### Role Badge Cell
Uses the same text-and-border badge approach established in Sprint 5. Owner gets the brightest white text with a solid thin border. Admin gets slightly dimmer text with a solid border. Member gets mid-grey text with a subtle border. Viewer gets dark grey text with a dashed border. No background fills on any badge.

### Tasks Assigned Cell
Shows the count as a number on the left. To the right of the count show the workload level label — Low, Medium, or High — in parentheses as small tertiary text. In admin view the workload level label text brightness varies: Low is tertiary grey, Medium is secondary grey, High is near-white. This creates a subtle visual emphasis without using colors. Below the count a slim horizontal progress bar. The bar fill represents the task count as a percentage of the High threshold which is fifteen tasks — so twelve tasks gives eighty percent fill. The bar track is dark grey. The fill brightness also varies by level — Low fill is dark grey, Medium is mid-grey, High is near-white.

### Completed Cell (Admin View Only)
Shows the count followed by the percentage in parentheses. No progress bar in this cell — it would be too visually dense alongside the tasks cell.

### Time Slots Booked Cell
Shows the count of booked slots. Below it a slim progress bar where the fill represents slots as a percentage of a maximum of eight slots per week. The fill is a mid-grey regardless of count level — this bar is informational not a warning indicator.

### Hours This Week Cell (Admin View Only)
Shows the total hours as a number followed by "h". No bar. If the hours exceed eight per day on average for the week meaning more than forty hours show the number with slightly brighter text to draw attention. Still no color — brightness variation only.

### Projects Cell (Admin View Only)
A wrapping row of small pill badges each showing a project name. Pills are dark grey background with subtle border and secondary grey text. Truncate project names longer than twelve characters with an ellipsis. If there are more than three projects show the first two and a "+N more" pill that shows all project names in a tooltip on hover.

### Status Cell
Shows either a small active indicator or an on leave badge. Active state shows a tiny circle icon in mid-grey and the text "Active" in secondary grey. On leave state shows a badge with the text "On leave" styled with a dark grey background and a lighter border. In admin view an additional action appears on hover in the status cell — a small toggle button labeled "Mark on leave" or "Mark active" depending on current status. Clicking this calls the leave toggle endpoint. This button is only visible to Owner and Admin roles.

---

## Frontend — Empty and Loading States

While data is loading show skeleton rows in the table — each row is a grey rectangle matching the approximate height of a real row with a subtle shimmer. Show five skeleton rows.

If the project has no members other than the authenticated user show an empty state below the table header saying "No other members in this project. Invite members from the Members settings page." with a link that navigates to the project settings members section.

If the role filter is applied and no members match show a message saying "No members match the selected role." with a clear filter button.

---

## Frontend — Scope Switching

When the scope is switched from project to workspace or vice versa re-fetch the workload data for the new scope. Show the skeleton rows during the fetch. If the workspace data was already fetched within the last sixty seconds use the cached store data and skip the API call. There is no Redis caching on the workload endpoints — the sixty seconds is purely a frontend store TTL check using the fetch timestamp stored in the store.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The Members tab shows the full workload table populated from the API
- Admin view shows all columns including completed rate, hours, and projects
- Member view shows only tasks assigned, time slots, and status
- The on leave banner appears when any visible member has on leave status true
- The leave toggle button is visible to Owner and Admin roles in the status cell on hover
- Clicking the leave toggle updates the database and refreshes the row
- The role filter correctly hides members not matching the selected role
- Sorting by any column works in both ascending and descending directions
- The scope toggle switches between project and workspace data
- Workspace scope shows aggregated data across all projects
- Skeleton rows show while data is loading
- Empty states display correctly for no members and no matching filter
- The Prisma migration adding the onLeave field to WorkspaceMember runs cleanly
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

The onLeave field added to WorkspaceMember in this sprint requires a Prisma migration — run prisma migrate dev with a name of add-on-leave-status. The workload level Low, Medium, High is a derived field computed in the backend service not stored in the database — compute it from the task count before returning the response. The frontend table sorting is entirely client-side against the store data — do not make additional API calls when sort direction changes. The sixty second frontend TTL check for scope switching should compare the current timestamp against a lastFetched timestamp stored in the workload store — if the difference is less than sixty thousand milliseconds use the cached data.
