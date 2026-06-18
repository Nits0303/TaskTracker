# Sprint 16 — Settings Pages (Workspace + Project)

## Goal
Complete and fully polish both the workspace settings page and the project settings page. Earlier sprints built partial versions of these pages as part of the workspace and project shells in Sprints 5 and 6. This sprint replaces those partial implementations with fully production-ready settings pages — every section complete, every role restriction enforced, every action wired to the correct backend endpoint, and every edge case handled gracefully. No new backend endpoints in this sprint — everything builds on the endpoints already built in Sprints 5 and 6.

---

## Guiding Principles

Settings pages must be trustworthy. Every action that modifies data must have clear feedback — success toasts, error messages, and loading states on buttons. Destructive actions must have friction — confirmation inputs that match specific text before the action fires. Role restrictions must be enforced on the frontend by hiding or disabling sections the authenticated user cannot access, but the backend guards remain the true enforcement layer. All UI stays within the black-to-white monochromatic palette.

---

## Page Layout — Shared Pattern

Both the workspace settings page and the project settings page use the same layout pattern. A single scrollable page divided into clearly separated sections. Each section has a title, a description subtitle, and its content below. Sections are separated by a full-width horizontal rule in the darkest border shade. The page has a maximum content width of six hundred and forty pixels centered in the main content area — not full width. This gives the settings page a focused, form-like feel.

The page loads all its data in one fetch on mount. Show a full-page skeleton while loading — skeleton rectangles matching the approximate shape of each section. On error show a centered error state with a retry button.

---

## Workspace Settings Page — `/w/:slug/settings`

### Access Control
Only Workspace Owner and Admin can access this page. If the authenticated user is a Member or Viewer redirect them to the workspace home page with a toast saying they do not have permission to access settings.

### Section — General
Title: General. Description: Update your workspace identity and basic details.

Fields in this section: a workspace logo upload area, a workspace name input, and a read-only slug field showing the current slug with a small lock icon indicating it cannot be changed after creation. Below the slug a small helper text explaining that slugs are permanent.

The logo upload area is a square dashed border box showing the current logo if one exists, or a camera icon with the text "Upload logo" if not. Clicking it opens the file picker. Accepted file types are JPEG, PNG, and WebP. Maximum file size is two megabytes — show a clear error if the file is too large. On selection upload the file immediately and show a circular progress indicator over the upload area. On success show the new logo. The logo should be uploaded to MinIO under a path structured as `workspaces/slug/logo/filename` and the URL stored on the workspace record.

The workspace name input shows the current name. Changes are not saved automatically — the user must click the Save changes button at the bottom of the section. The button shows a loading spinner while the PATCH request is in flight. On success show a success toast. On error show an error toast.

### Section — Members
Title: Members. Description: Manage who has access to this workspace and their roles.

Show the invite member form at the top of the section. An email input and a role selector dropdown side by side with an Invite button to the right. Validate the email format client-side before enabling the Invite button. On successful invite show a success toast saying the invite was sent and log the invite URL to the console as in Sprint 5.

Below the invite form the full member table. Columns: member avatar and name, email, role badge, joined date, and an actions column. The actions column shows a role change dropdown and a remove button on rows for members below the authenticated user's role level. The Owner row has no action buttons.

Changing a role shows a confirmation popover anchored to the dropdown — "Change Arjun S. to Admin?" with Confirm and Cancel buttons. Confirming calls the change role endpoint. On success update the row in the table and show a toast.

Removing a member shows a small confirmation popover — "Remove Priya M. from this workspace?" with a Remove button styled with a brighter border and a Cancel button. On confirm call the remove member endpoint. On success remove the row from the table with a fade-out animation and show a toast.

This section is visible to both Owner and Admin. The Owner row is always protected — no one can change or remove the Owner through this UI.

### Section — Notifications
Title: Notification defaults. Description: Set the default notification behaviour for this workspace.

Two toggle rows. The first is "Email notifications" with a sub-label explaining that workspace members receive email updates for task assignments, mentions, and invites. The second is "Invite-only workspace" with a sub-label explaining that only users with an invite link can join. Both toggles save immediately on change — no separate save button in this section. Show a brief saving indicator on the toggle while the PATCH request is in flight.

This section is visible to Owner and Admin.

### Section — Danger Zone
Title: Danger zone. Styled differently from other sections — the section has a subtle border around it in a darker shade and the title is rendered in a slightly brighter white than the section description to draw attention without using color.

This section is only visible to the Owner role. Admins do not see it. If an Admin somehow navigates to this section's anchor return early and render nothing.

Two actions in the danger zone each in their own row.

The first action is Archive workspace. Left side shows the action name in near-white and a description saying archiving hides the workspace from the selector but preserves all data. Right side shows an Archive button with a ghost style — dark background, lighter border, near-white text. Clicking Archive opens a confirmation modal overlay. The modal has a heading, a description explaining the action, a text input with a placeholder saying "Type the workspace name to confirm", and an Archive button that is disabled until the input exactly matches the workspace name. On confirm call the archive endpoint, show a success toast, and redirect to the workspace selector page.

The second action is Delete workspace. Left side shows the action name and a description clearly stating this permanently deletes all projects, tasks, and data and cannot be undone. Right side shows a Delete button with a filled style — near-white background with dark text — making it visually distinct from the archive button. Clicking opens a confirmation modal. The modal has a heading in a slightly brighter white, a strongly worded warning description, an input with placeholder "Type DELETE to confirm", and a Delete button that is disabled until the input contains the exact string DELETE in uppercase. On confirm call the delete endpoint, show a brief success toast, clear the workspace from the Zustand store, and redirect to the workspace selector page.

---

## Project Settings Page — `/w/:slug/projects/:projectId/settings`

### Access Control
Project Admin and Workspace Owner can access all sections. Members and Viewers are redirected to the project board page with a toast.

### Section — General
Title: General. Description: Update project details and status.

Fields: project name input, description textarea that auto-expands to up to six lines, and a status selector. The status selector shows the three options — Active, On Hold, Completed — as a segmented control rather than a dropdown. Each option is a button in a button group. The active selection has a slightly lighter background. Selecting a different status does not save immediately — the user clicks Save changes.

All three fields are in a single form. The Save changes button is at the bottom of the section and saves all three fields in one PATCH call. On success show a toast. On error show a toast with the API error message.

### Section — Members
Title: Project members. Description: Add workspace members to this project and assign their roles. Only workspace members can be added to a project.

An add member form at the top. A dropdown selector listing all workspace members who are not already project members — show their name and workspace role in each option. A role selector next to it. An Add button. On submit call the add project member endpoint. On success add the new member to the table and show a toast. If the workspace member list is empty show a message saying all workspace members are already in this project.

The member table columns are: avatar and name, workspace role badge, project role badge, and an actions column. Show both workspace role and project role because they can differ. Actions column has a change project role dropdown and a remove button on rows the authenticated user has permission to act on. Same confirmation popovers as the workspace members section.

### Section — Preferences
Title: Preferences. Description: Control real-time sync and visibility for this project.

Two toggle rows. The first is "Real-time updates" with a sub-label saying live task changes are pushed to all connected members via Socket.IO. The second is "Public project" with a sub-label saying all workspace members can view this project even if not explicitly added. Both toggles save immediately on change with a brief saving indicator.

If the real-time updates toggle is turned off show a small informational note below it saying members will need to refresh to see changes — this makes the consequence of disabling it clear.

### Section — Danger Zone
Same styling as the workspace danger zone section. Visible to Project Admin and Workspace Owner only.

Two actions.

The first is Archive project. Same pattern as workspace archive — opens a confirmation modal. The input should match the project name. On confirm call the archive endpoint, show a toast, and navigate back to the workspace home. The archived project should no longer appear in the active project list in the sidebar.

The second is Delete project. Same pattern as workspace delete — opens a modal requiring the user to type DELETE. On confirm call the delete endpoint, show a toast, remove the project from the Zustand store, and navigate to the workspace home. The project disappears from the sidebar project list immediately.

---

## Frontend — Confirmation Modal Component

Build a reusable ConfirmationModal component that both settings pages use. It accepts the following props: a title, a description, an optional input confirmation requirement object containing the expected string and a placeholder, a confirm button label, a confirm button style which is either ghost or filled, an onConfirm callback, an onCancel callback, and an isLoading boolean.

When isLoading is true show a spinner inside the confirm button and disable both buttons. The modal should trap focus while open — tabbing should cycle only between the input and the buttons. Pressing Escape closes the modal and calls onCancel. The modal overlays the full screen with a dark semi-transparent backdrop.

---

## Frontend — Logo Upload Component

Build a reusable LogoUpload component used in both the workspace settings general section and the workspace creation flow from Sprint 5. It accepts the current logo URL, an upload handler function, and an optional size prop. It handles file selection, type validation, size validation, upload progress display, and success or error state. Internally it uses the MinIO upload pattern from Sprint 7.

---

## Frontend — Unsaved Changes Guard

Both settings pages should warn the user if they try to navigate away with unsaved changes in any form section. Use the Next.js router's `beforePopState` or the browser's `beforeunload` event to detect navigation. Show a browser native confirm dialog — do not build a custom one for this. The warning only fires for the general section forms which have explicit save buttons. Sections with immediate-save toggles do not need this guard since they save on change.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Members and Viewers are redirected away from both settings pages with a toast
- The workspace general section saves name and logo changes with success and error toasts
- Logo upload shows progress and updates the sidebar workspace logo on success
- The workspace members section invite form validates email and shows a success toast on invite
- Role change and remove member both show confirmation popovers and update the table on confirm
- Workspace notification toggles save immediately with a saving indicator
- The workspace danger zone is hidden from Admins and only visible to the Owner
- Archive workspace requires typing the workspace name and redirects to workspace selector on confirm
- Delete workspace requires typing DELETE and clears the store and redirects on confirm
- The project general section saves name, description, and status in one call
- The project members section shows both workspace and project role badges per member
- Adding a project member filters the dropdown to only unjoined workspace members
- Project preference toggles save immediately
- The project danger zone requires typing the project name for archive and DELETE for delete
- Both modals disable the confirm button until the input matches exactly
- The ConfirmationModal component is reusable and used by all four danger zone actions
- The LogoUpload component is reusable between workspace settings and the create workspace flow
- Unsaved changes guard fires when navigating away from a modified general section form
- No colors outside the black-to-white range appear anywhere

---

## Notes for Antigravity

Do not build new backend endpoints in this sprint. All endpoints already exist from Sprints 5 and 6 — this sprint is purely frontend completion and polish. The ConfirmationModal and LogoUpload components should be placed in a shared components directory inside `apps/web/src/components/shared` so they can be imported by any page. The logo upload in this sprint should reuse the same MinIO upload pattern from the attachments tab in Sprint 7 — do not create a second upload mechanism. The unsaved changes guard using `beforeunload` only fires on browser close or refresh in modern browsers — for in-app Next.js navigation use the router events approach to detect the navigation before it happens and prompt the user.
