# Sprint 6 — Project CRUD (Backend + Frontend)

## Goal
Build the complete project management layer. By the end of this sprint a workspace member should be able to create projects, view them in a list, open a project, and manage project members and settings. The project shell — the layout with tabs for Board, Dashboard, Activity, Calendar, Members, and Settings — must be in place by the end of this sprint even if the tab content pages are empty placeholders. Every future sprint will fill in those tabs.

---

## Guiding Principles

Projects live inside workspaces. Every project-scoped API call must verify the authenticated user is a member of both the workspace and the project before returning data. The project shell layout is as important as the data layer in this sprint — it is the frame every future feature sprint renders inside.

---

## Backend — Project Module

Create a `ProjectModule` inside `apps/api/src/project`. Import the Prisma service. Protect all endpoints with the JWT auth guard. Reuse the `WorkspaceRoleGuard` from Sprint 5 for workspace-level checks. Create an additional `ProjectRoleGuard` that works the same way but checks the user's role within the specific project.

### Endpoints to Build

#### POST /workspaces/:slug/projects
Create a new project inside a workspace. Only Workspace Owner and Admin may create projects. Accept a project name, description, and optional status in the request body. Validate with the Zod schema from `@repo/shared`. Create the project record linked to the workspace. Automatically create a ProjectMember record linking the authenticated user to the project with the Admin role. Return the full project object.

#### GET /workspaces/:slug/projects
Return all projects in the workspace that the authenticated user is a member of. For each project return the name, description, status, archived status, the user's role, the member count, and the task counts broken down by status — total, todo, in progress, review, and completed. Workspace Owners and Admins see all projects including ones they are not explicitly a member of. Members and Viewers only see projects they have been added to.

#### GET /workspaces/:slug/projects/:projectId
Return a single project by ID. Verify the user has access. Return the project details, the full member list with roles, and the task status counts.

#### PATCH /workspaces/:slug/projects/:projectId
Update a project. Only Project Admin and above may do this. Accept name, description, and status as optional fields. Return the updated project.

#### PATCH /workspaces/:slug/projects/:projectId/archive
Archive a project. Only Project Admin and Workspace Owner may do this. Set the archived flag to true. Return the updated project.

#### DELETE /workspaces/:slug/projects/:projectId
Hard delete a project. Only Workspace Owner may do this. Require the project name to be passed in the request body as confirmation. Return a success message.

#### POST /workspaces/:slug/projects/:projectId/members
Add a workspace member to a project. Only Project Admin and above may do this. The user being added must already be a workspace member — validate this before adding. Accept user ID and role. Create the ProjectMember record. Return the updated member list.

#### PATCH /workspaces/:slug/projects/:projectId/members/:userId/role
Change a project member's role. Only Project Admin and above may do this. Return the updated membership.

#### DELETE /workspaces/:slug/projects/:projectId/members/:userId
Remove a member from the project. Same role rules as workspace member removal. Return a success message.

---

## Backend — Project Role Guard

Create a `ProjectRoleGuard` that reads the project ID from the route parameters, looks up the authenticated user's ProjectMember record, and denies with four hundred three if their role is below the required level. If the user has no ProjectMember record but is a Workspace Owner or Admin, they should be allowed through — workspace admins have implicit access to all projects. This guard should be generic and accept a minimum role level the same way the WorkspaceRoleGuard does.

---

## Frontend — Project Store

Create a dedicated Zustand store for project state. It should hold the list of projects for the active workspace, the currently active project object, and a boolean for loading state. Create actions for setting the project list, setting the active project, updating a project in the list, and removing a project from the list.

---

## Frontend — Pages and Layout to Build

### Projects List — inside `/w/:slug`

Replace the empty state placeholder from Sprint 5 with the real projects list. Show a grid of project cards. Each card should display the project name, description truncated to two lines, the project status badge, the member count, and a small row of task count indicators showing how many tasks are in each status bucket. Use subtle grey variations for the status indicators — no colors.

The card hover state should show a slightly lighter background. A small three-dot menu on each card should reveal options for the user's permission level — Archive and Settings for admins, just Open for members and viewers.

At the top of the projects list show a heading with the workspace name and a create project button aligned to the right. This button should only be visible to Workspace Owner and Admin roles.

### Create Project Modal

When the create project button is clicked open a modal overlay. The modal should have a project name input, an optional description textarea, and a status selector defaulting to Active. A cancel button and a create button. On success close the modal, add the project to the store, and navigate to the project shell.

### Project Shell — `/w/:slug/projects/:projectId`

This is the second major layout shell of the application after the workspace sidebar. It renders inside the existing workspace sidebar layout from Sprint 5 but adds a project-level header and tab bar.

The project header should sit at the top of the main content area. It shows the project name on the left with the project status badge next to it. On the right show a members avatar stack — up to four member avatars overlapping each other with a count badge if there are more. Next to that a project settings icon button.

Below the header a horizontal tab bar with six tabs: Board, Dashboard, Activity, Calendar, Members, and Settings. The active tab should have a near-white bottom border underline. Inactive tabs should be mid-grey text. Hovering a tab lightens the text slightly.

Each tab should route to a sub-path:
- Board renders at `/w/:slug/projects/:projectId/board`
- Dashboard renders at `/w/:slug/projects/:projectId/dashboard`
- Activity renders at `/w/:slug/projects/:projectId/activity`
- Calendar renders at `/w/:slug/projects/:projectId/calendar`
- Members renders at `/w/:slug/projects/:projectId/members`
- Settings renders at `/w/:slug/projects/:projectId/settings`

For this sprint every tab except Members and Settings should show a clean placeholder — a centered message saying "Coming in the next sprint" on the dark background. Do not leave them blank, show intentional empty states.

### Project Members Tab

Build the full project members tab as designed during planning. Show a table with member avatar, name, email, role badge, and action buttons for admins. At the top an add member button that opens a modal with a dropdown of existing workspace members who are not yet in the project and a role selector. On submit call the add member endpoint and update the store.

### Project Settings Tab

Build the full project settings page as designed during planning. General section with name, description, and status. Preferences section with the real-time updates toggle and public project toggle — these just save to the database for now, the real-time toggle will be wired in Sprint 8. Danger zone with archive and hard delete, each requiring confirmation. Only show the danger zone to Project Admin and Workspace Owner roles.

---

## Sidebar Update

Update the workspace sidebar from Sprint 5 to show the list of projects the user belongs to beneath the main workspace navigation links. Each project should appear as a clickable item that navigates to the project's board tab. The currently active project should be highlighted with a slightly lighter background. If there are more than eight projects show a scroll area within the sidebar for the project list. The sidebar project list should update reactively when a new project is created or deleted.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The workspace home shows a real project card grid populated from the API
- Creating a project saves to the database and adds the creator as Admin
- The project shell renders with the six-tab navigation
- Navigating between tabs changes the URL and renders the correct content
- The Board, Dashboard, Activity, and Calendar tabs show intentional placeholder states
- The Members tab shows the full member table with role management working
- The Settings tab saves general changes and handles archive and delete with confirmations
- Adding a project member requires the user to already be a workspace member
- The ProjectRoleGuard correctly restricts endpoint access by role
- Workspace Owners and Admins implicitly pass the ProjectRoleGuard
- The sidebar shows the project list and highlights the active project
- All UI stays within the black-to-white monochromatic palette

---

## Notes for Antigravity

The project shell layout using Next.js App Router nested layouts is the most important structural decision in this sprint. Set it up so the project header and tab bar are part of a layout file for the `/w/:slug/projects/:projectId` route segment. This means the header and tabs persist without remounting as the user switches between Board, Dashboard, Activity, Calendar, Members, and Settings. Every sprint from 7 onwards renders content inside this layout. The placeholder tab content is intentional — do not try to build any real tab content in this sprint. Focus on getting the shell, the navigation, and the data layer exactly right.
