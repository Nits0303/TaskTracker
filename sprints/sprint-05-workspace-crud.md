# Sprint 5 — Workspace CRUD (Backend + Frontend)

## Goal
Build the complete workspace management layer — backend endpoints and the frontend pages for creating, viewing, switching between, and managing workspaces. By the end of this sprint a logged-in user should be able to create a workspace, see all their workspaces, switch between them, and land on a workspace home page that lists all projects. No project creation yet — that is Sprint 6.

---

## Guiding Principles

A user can belong to multiple workspaces. The currently active workspace should be stored in the Zustand store and persisted in localStorage so it survives a page refresh. Every workspace-scoped API call must verify that the authenticated user is actually a member of that workspace before returning any data. Never trust the workspace ID from the URL alone — always cross-check against the membership table.

---

## Backend — Workspace Module

Create a `WorkspaceModule` inside `apps/api/src/workspace`. It should import the Prisma service and be protected entirely by the JWT auth guard. Every endpoint in this module requires authentication.

### Endpoints to Build

#### POST /workspaces
Create a new workspace. Accept a workspace name and slug in the request body. Validate using the Zod schema from `@repo/shared`. Check that the slug is unique across all workspaces — if taken return a four hundred nine conflict error. Create the workspace record. Automatically create a WorkspaceMember record linking the authenticated user to this workspace with the Owner role. Return the full workspace object including the creator's membership details.

#### GET /workspaces
Return all workspaces the authenticated user is a member of. For each workspace include the workspace name, slug, logo URL, archived status, the user's role in that workspace, the total member count, and the total project count. Do not return workspaces the user has no membership in even if they somehow know the ID.

#### GET /workspaces/:slug
Return a single workspace by its slug. Verify the authenticated user is a member. Return the workspace details plus the full member list with each member's name, email, avatar, and role. Return a four hundred four if the workspace does not exist or the user is not a member.

#### PATCH /workspaces/:slug
Update a workspace. Only Owner and Admin roles may do this. Accept workspace name and logo URL as optional fields. The slug itself should not be changeable after creation. Return the updated workspace.

#### PATCH /workspaces/:slug/archive
Archive a workspace. Only the Owner may do this. Set the archived flag to true. Return the updated workspace. Archived workspaces should still appear in GET /workspaces but be visually marked as archived on the frontend.

#### DELETE /workspaces/:slug
Hard delete a workspace. Only the Owner may do this. This will cascade delete all projects, tasks, and everything inside the workspace per the schema rules from Sprint 2. Before deleting, require the user to confirm by passing the workspace name in the request body — if it does not match the actual workspace name return four hundred bad request. Return a success message.

#### POST /workspaces/:slug/members
Invite a member by email. Only Owner and Admin may do this. This should call the same invite logic from the auth module — generate an invite token, create the Invite record, and log the invite URL to the console. The role should default to Member if not specified.

#### PATCH /workspaces/:slug/members/:userId/role
Change a member's role. Only the Owner may change roles. The Owner role itself cannot be transferred through this endpoint — add a separate transfer ownership endpoint if needed. Return the updated membership.

#### DELETE /workspaces/:slug/members/:userId
Remove a member from the workspace. Owner and Admin may remove Members and Viewers. Only the Owner may remove an Admin. No one can remove the Owner. Return a success message.

---

## Backend — Role Guard

Create a reusable `WorkspaceRoleGuard` that can be applied to any workspace endpoint. It should accept a minimum required role level. The role hierarchy from lowest to highest is Viewer, Member, Admin, Owner. When applied to an endpoint it should read the workspace slug from the route parameters, look up the authenticated user's membership, and deny access with four hundred three if their role is below the required level. This guard will be reused in every workspace-scoped endpoint across future sprints.

---

## Frontend — Workspace Store

Extend the Zustand store or create a dedicated workspace store. It should hold the list of all workspaces the user belongs to, the currently active workspace object including the user's role in it, and a boolean for whether workspaces are loading. Create actions for setting the workspace list, setting the active workspace, and updating a workspace in the list. Persist the active workspace slug to localStorage so switching workspaces survives a refresh.

---

## Frontend — Pages to Build

### Workspace Selector — `/workspaces`

This is the page a user lands on after logging in if they belong to more than one workspace, or if they have no workspaces yet.

If the user has no workspaces show a centered empty state on the dark background. A large heading saying "No workspaces yet" with a subheading encouraging them to create one. A single prominent button to create a new workspace.

If the user has workspaces show a grid of workspace cards. Each card shows the workspace logo or a generated initial avatar if no logo exists, the workspace name, the user's role badge, the member count, the project count, and an archived badge if applicable. Clicking a card sets it as the active workspace and navigates to `/w/:slug`. The card hover state should lift the card slightly using a subtle box shadow change — keep the shadow dark-toned.

A button in the top right to create a new workspace.

### Create Workspace — Modal or Inline Page

When the user clicks create workspace, open a modal overlay on the dark background. The modal card follows the same dark grey card style. It should have a logo upload area, a workspace name input, and a slug input that auto-generates from the name. A cancel button and a create button. On success close the modal, add the new workspace to the store, set it as active, and navigate to `/w/:slug`.

### Workspace Home — `/w/:slug`

This is the main shell of the application. It should have a persistent left sidebar and a main content area.

The left sidebar should be narrow and dark — slightly darker than the card background. At the top show the workspace logo and name with a dropdown chevron. Clicking this opens a small popover showing all the user's workspaces so they can switch, plus an option to create a new workspace. Below that show navigation links for the workspace: Projects, Members, and Settings. At the very bottom of the sidebar show the authenticated user's avatar and name with a small logout button.

The main content area for this page specifically should show a projects list — but since Sprint 6 has not happened yet, just show an empty state that says "No projects yet" with a placeholder create project button that does nothing. The real project list will be wired in Sprint 6.

The workspace home page should call GET /workspaces/:slug on load and populate the store. Show a skeleton loader while the data is in flight — skeleton elements should be dark grey rectangles animating a subtle shimmer using only grey shades.

### Workspace Members Page — `/w/:slug/members`

Show the full member table designed in the planning phase. Each row shows the member avatar with initials, full name, email, role badge, and joined date. Owners and Admins see action buttons — a change role dropdown and a remove button — on rows for members below their role level. The Owner row has no action buttons.

At the top of the page show an invite button. Clicking it opens a small modal with an email input and a role selector dropdown. Submitting calls the invite endpoint and shows a success toast.

Role badge styles must stay within the monochromatic palette. Use different grey shades and border styles to differentiate Owner, Admin, Member, and Viewer rather than colors.

### Workspace Settings Page — `/w/:slug/settings`

Implement the workspace settings page as designed in the planning phase. General section with name and logo upload. Notifications section with toggles. Danger zone with archive and hard delete — both requiring confirmation inputs before the action fires. Only show the danger zone to the Owner role. Admins see general and members sections only. Members and Viewers should be redirected away from this page entirely.

---

## Navigation and Layout

The sidebar and top bar layout established in this sprint will be the persistent shell for the entire application going forward. Get it right here. Every future page will render inside the main content area of this shell. The sidebar should highlight the active navigation item using a slightly lighter grey background on the active link. Use Next.js App Router layouts so the sidebar only renders once and does not remount on navigation.

---

## Toast Notifications

Set up a lightweight toast notification system that will be used throughout the rest of the application. Toasts should appear in the bottom right corner of the screen. They should be small dark cards with a subtle border. Success toasts have no special color — just a checkmark icon in near-white. Error toasts similarly stay monochromatic. Each toast auto-dismisses after four seconds. Maximum two toasts visible at once.

---

## Definition of Done

This sprint is complete when all of the following are true:

- A logged-in user with no workspaces sees the empty state and can create one
- Creating a workspace saves to the database, creates the Owner membership, and navigates to the workspace home
- A user with multiple workspaces sees the workspace selector grid and can switch between them
- The active workspace persists across page refreshes via localStorage
- GET /workspaces returns only workspaces the user belongs to
- The workspace home shows the sidebar with navigation, workspace switcher, and empty projects area
- The members page shows the full member table with role badges and action buttons
- Inviting a member logs the invite URL to the console and creates the Invite record
- Changing a role updates the WorkspaceMember record
- Removing a member deletes the WorkspaceMember record
- The settings page saves name and logo changes
- Archive sets the archived flag and updates the UI
- Hard delete requires name confirmation and cascade deletes everything
- Role guards prevent Members and Viewers from reaching admin-only endpoints
- All UI uses only black-to-white shades with no color accents

---

## Notes for Antigravity

The sidebar layout shell built in this sprint is permanent infrastructure. Take care with the Next.js App Router layout file — it should wrap all `/w/:slug` routes so the sidebar persists without remounting. The workspace slug in the URL is the primary identifier for all workspace-scoped routes going forward. The WorkspaceRoleGuard built here will be imported and reused in Sprints 6, 7, and beyond — build it generically enough to handle any role level check with a single decorator.
