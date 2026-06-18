# Sprint 18 — Polish + Performance + Final QA

## Goal
This is the final sprint. Every feature is built. Every edge case is handled. This sprint is about making the application feel production-ready — fast, smooth, consistent, and complete. It covers performance optimisations across the stack, UI consistency audit, accessibility basics, loading state polish, final README and API documentation, and a complete end-to-end QA pass. By the end of this sprint the application should be indistinguishable from a professionally shipped product.

---

## Guiding Principles

Polish is not decoration — it is the difference between a product that feels trustworthy and one that feels half-finished. Every interaction should feel intentional. Every loading state should feel smooth. Every empty state should feel designed. Performance work is only done where it measurably matters. Documentation is written for a developer who has never seen the codebase.

---

## Backend — Performance Pass

### Query Audit
Go through every endpoint and identify any that make more database queries than necessary. Specifically look for N+1 query patterns — these happen when a list is fetched and then a separate query is run for each item in the list. Prisma's `include` and `select` should be used to fetch related data in a single query wherever possible. Common culprits to check: the task list endpoint loading assignee details one by one, the workspace members endpoint loading user details separately, and the activity feed endpoint loading actor details per event.

### Response Payload Trimming
Audit every API response and remove any fields that the frontend does not use. Over-fetching wastes bandwidth and slows down the client. Use Prisma's `select` to return only the fields each endpoint actually needs. Never return password hashes, raw refresh tokens, internal flags like `reminderSent`, or full nested objects when only a few fields are needed.

### Database Connection Pooling
Configure Prisma's connection pool size explicitly via the `connection_limit` parameter in the database URL. Set it to ten connections for the current single-node setup. Add this to the `.env.example` with a comment explaining it.

### Redis Cache Audit
Review all Redis cache keys set in earlier sprints. Ensure every key has a TTL — no cache key should be set without an expiry. List all cache keys and their TTLs in a comment block at the top of each service file that uses Redis caching. Ensure cache invalidation is consistent — if a task is updated the dashboard cache for that project must be invalidated.

---

## Backend — API Documentation

Create an `API.md` file in the root of `apps/api`. Document every endpoint in the application. For each endpoint provide the HTTP method and path, a one-sentence description, the required auth level, the request body shape if applicable with field names and types, the success response shape, and the possible error responses with their status codes. Group endpoints by module. The documentation does not need to be elaborate — clear and accurate is the goal.

Also set up Swagger via the `@nestjs/swagger` package. Configure it to generate an interactive API explorer available at `/api/docs` when the app is running in development mode. Decorate the key endpoints across the task, auth, workspace, and project modules with basic Swagger decorators — `@ApiOperation`, `@ApiResponse`, and `@ApiBearerAuth`. Full decoration of every endpoint is not required — the most commonly used ones are enough for the assignment submission.

---

## Frontend — Performance Pass

### Bundle Analysis
Run a Next.js bundle analysis using `@next/bundle-analyzer`. Identify any packages that are unexpectedly large. Check specifically for: any charting library that may have been added despite the Sprint 12 instruction, any icon library loading its entire icon set when only a few icons are used, any utility library loaded in full when only one function is needed, and any duplicate packages.

### Code Splitting
Ensure the task slide-over panel is lazy loaded using Next.js dynamic imports. It is a large component that should not be in the initial page bundle since it is not visible on load. Similarly lazy load the calendar time grid component and the notification bell panel. Each of these should show a minimal skeleton while loading.

### Image Optimisation
All user avatars and workspace logos should be served through Next.js's built-in Image component with appropriate `width`, `height`, and `priority` props. MinIO attachment thumbnails for image files should also use the Image component. Ensure the MinIO domain is added to the `remotePatterns` configuration in `next.config.js`.

### TanStack Query Configuration
Audit the TanStack Query setup. Set a global `staleTime` of thirty seconds so data is not refetched on every component mount. Set `gcTime` to five minutes. Configure `retry` to two attempts with exponential backoff. These defaults prevent unnecessary refetches and make the app feel snappier when navigating between pages that share cached data.

### Memoisation Audit
Audit the board page and task card components specifically. Task cards are the most frequently rendered components in the application. Wrap the task card component in `React.memo` so it only re-renders when its specific task data changes. Ensure the task store selectors use shallow equality comparison so the entire board does not re-render when a single task changes. Use `useCallback` on the drag handler functions passed to dnd-kit to prevent unnecessary re-renders during drag operations.

---

## Frontend — UI Consistency Audit

Go through every page and component in the application and check for the following inconsistencies. Fix every one found.

Typography consistency: headings should all use the same font weight and size scale. Body text should be consistently thirteen or fourteen pixels — pick one and apply it everywhere. Labels and helper text should be consistently eleven or twelve pixels. Tertiary text should all use the same CSS variable token.

Spacing consistency: all cards and panels should use the same internal padding — sixteen pixels all sides for standard cards, twelve pixels for compact cards like task cards and notification items. All section gaps should use consistent values from the spacing scale.

Border consistency: all card borders should use the same CSS variable token for border color. No hardcoded hex values for borders anywhere in the component files.

Border radius consistency: all cards use the same border radius. All buttons use a slightly smaller radius. All pills and badges use the full radius to appear as capsules.

Button consistency: every primary action button across the application should look identical. Every ghost button should look identical. Every danger button should look identical. Check every settings page, modal, form, and panel for stray button styles.

Input consistency: every text input, textarea, and select should share the same visual treatment — same border, same background, same focus ring, same disabled state. Audit every form in the application.

Empty state consistency: every empty state in the application should follow the same pattern — an icon, a heading, a sub-heading, and optionally an action button. Check the board, activity feed, comments tab, attachments tab, notifications panel, workspace selector, and members table.

Loading state consistency: every skeleton loader should use the same animation — a single opacity pulse from the card background shade up two steps and back, at one and a half seconds per cycle. No spinners for page-level loading — only skeleton loaders. Spinners are reserved for in-button loading states only.

---

## Frontend — Accessibility Basics

This application does not need to be fully WCAG compliant but it should meet basic accessibility standards.

Every interactive element — buttons, links, inputs, checkboxes, toggles — must have a visible focus ring when navigated to via keyboard. The focus ring should be a subtle outline using the near-white CSS variable token with a two pixel offset so it does not overlap the element's border.

Every icon button must have an `aria-label` attribute describing its action. Every form input must have an associated label either via `htmlFor` or `aria-label`. Every image must have an `alt` attribute.

The task slide-over panel must trap focus while open. Tab should cycle through interactive elements inside the panel only. Escape should close the panel.

The confirmation modal must trap focus while open in the same way.

The notification bell panel must trap focus while open.

The drag and drop board must be keyboard navigable — dnd-kit supports this via its keyboard sensor. Ensure the keyboard sensor is included in the DndContext sensors array alongside the mouse and pointer sensors from Sprint 9.

---

## Frontend — Final Micro-Interactions

Add the following small interactions that make the application feel polished and complete.

When a task card is created via the inline column form it should animate into the column with a brief slide-down and fade-in rather than simply appearing. The animation should be approximately two hundred milliseconds.

When a task card is deleted from the board it should animate out with a brief fade and scale-down before the space collapses. Two hundred milliseconds.

When the task status changes via drag the card in the destination column should have a brief highlight pulse — the card border brightens for one second then returns to normal — to draw attention to the newly arrived card for other users seeing the change in real time.

When a new notification arrives in the bell panel and the panel is open the new notification item should slide down from above with a smooth animation.

When the offline banner appears it should slide down from the top of the viewport. When it disappears it should slide back up.

All these animations should respect the user's `prefers-reduced-motion` media query — if it is set to reduce, skip all animations and use instant state changes instead.

---

## README

Create a comprehensive `README.md` at the monorepo root. It must include the following sections in order:

A project title and one-paragraph description explaining what the application is and who it is for.

A tech stack section listing all technologies used with a one-line description of what each one does in the project.

A prerequisites section listing Node.js version, pnpm version, Docker, and Docker Compose as requirements with the specific versions used during development.

A getting started section with step-by-step instructions: clone the repository, copy `.env.example` to `.env` and fill in the required values, run `docker-compose up -d` to start PostgreSQL Redis and MinIO, run `pnpm install` to install dependencies, run `pnpm --filter api prisma migrate dev` to apply database migrations, run `pnpm dev` to start all services. Each step should be a numbered list with the exact command to run.

An environment variables section listing every variable in the `.env.example` with a description of what it is used for and whether it is required or optional.

An architecture overview section with a brief description of the monorepo structure, the communication patterns between frontend and backend, and how real-time sync works.

A features section listing all major features in a bullet list — one line per feature.

A known limitations section honestly listing anything that is not production-ready: email sending uses Ethereal fake SMTP in development, browser push requires HTTPS in production, MinIO is self-hosted and not replicated, there is no billing system.

---

## Final QA Checklist

Go through the following scenarios manually and confirm each one works correctly end to end.

Auth flow: register a new account with the three-step flow, log in with the same credentials, log out, log back in, use the forgot password flow, accept a team invite in a fresh incognito window.

Workspace flow: create a workspace, invite a member, accept the invite, change the member's role, remove the member, archive the workspace, restore it by un-archiving from the database directly, delete the workspace.

Project flow: create a project, add a member with Member role, verify the member can see the project, remove the member, verify they lose access, archive the project, delete the project.

Task flow: create a task via the inline form, open the panel, edit every field inline, add a sub-task, check it off, add a comment, reply to the comment, upload a file, download it, delete the attachment, delete the sub-task, delete the task.

Real-time flow: open the same project in two browser tabs, create a task in tab one and verify it appears in tab two, drag a card between columns in tab one and verify the move appears in tab two, post a comment in tab two while the task panel is open in tab one and verify the comment appears.

Calendar flow: assign a task with a time slot, verify the block appears on the assignee's calendar, open team availability, request a meeting slot, accept it from the notification bell, verify the slot is blocked on both users' calendars.

Offline flow: open the board, disconnect the network, verify the offline banner appears, reconnect, verify the banner disappears and the task list is re-fetched.

Conflict flow: open the same task in two browser tabs, edit the title in both simultaneously, submit one and then the other, verify the conflict toast appears in the second tab and the server version is shown.

Notifications flow: assign a task to another user and verify they receive an in-app notification, verify the bell badge increments, open the bell and verify the notification, mark it as read, dismiss it.

---

## Definition of Done

This sprint is complete when all of the following are true:

- No N+1 query patterns exist in any endpoint
- Every API response contains only the fields the frontend uses
- All Redis cache keys have TTLs
- `API.md` documents every endpoint
- Swagger is accessible at `/api/docs` in development
- Bundle analysis shows no unexpected large packages
- The task slide-over panel, calendar, and notification bell are lazy loaded
- All avatar and logo images use the Next.js Image component
- TanStack Query global config has staleTime thirty seconds and retry two
- Task card is wrapped in React.memo with shallow equality store selectors
- Every page and component uses consistent typography, spacing, borders, and border radius
- Every button type looks identical across the entire application
- Every empty state follows the same pattern
- Every skeleton loader uses the same animation
- All icon buttons have aria-label attributes
- All inputs have associated labels
- Focus trapping works in the panel, modal, and notification bell
- Keyboard sensor is added to the dnd-kit DndContext
- All six micro-interactions are implemented and respect prefers-reduced-motion
- The README covers all required sections and all commands work as documented
- All QA scenarios pass end to end
- No colors outside the black-to-white range appear anywhere in the entire application

---

## Notes for Antigravity

This is the final sprint — resist the temptation to add new features. If you notice something missing from a previous sprint make a note of it but do not implement it here unless it is a critical bug. The QA checklist must be executed manually — do not skip steps. The bundle analysis must be run and the output reviewed before declaring this sprint done. The README must be written last after everything else is confirmed working — it should reflect the actual working state of the application not an aspirational description. When this sprint is complete the application is ready for submission and demonstration.
