# Sprint 22 — Global Search (Postgres Full-Text + Trigram Hybrid)

## Goal
Add a global search experience to the application. By the end of this sprint a user should be able to search for tasks, sub-tasks, and projects from a search input in the persistent sidebar, scoped to either the current project or the entire workspace, with live ranked results as they type. The search must be powered entirely by PostgreSQL — no external search engine — combining full-text search for relevance ranking with trigram matching for typo tolerance. This sprint covers search only; it does not change or extend the existing client-side board filters from Sprint 9.

---

## Guiding Principles

Search must respect every access control rule already in place elsewhere in the application — a user must never see a task, sub-task, or project they would not otherwise be able to open. Search must stay fast as data grows, which means every query goes through proper indexes, never a sequential scan. Search results must feel instant, so the frontend debounces input and the backend returns a single ranked, capped list rather than something the frontend has to sort or merge itself. The entire search UI — input, dropdown, badges, highlight effects — must stay strictly within the black-to-white monochromatic palette established in Sprint 1. No colors outside that range anywhere in this sprint.

---

## Backend — Database Changes (Search Indexes)

Enable the `pg_trgm` Postgres extension as part of this sprint's migration.

Add a generated, stored `tsvector` column to the Task model that combines the title and description into a single weighted search vector — the title should carry a higher weight than the description so title matches rank above description matches. Add a similarly weighted generated `tsvector` column to the Project model combining the project name and description, name weighted higher than description. Add a generated `tsvector` column to the SubTask model containing only the title, since sub-tasks have no description field.

Prisma does not natively support defining a generated `tsvector` column through its schema language. Represent each of these three columns in `schema.prisma` using Prisma's unsupported type escape hatch so the column exists in the schema for visibility, but after Prisma generates the migration skeleton, hand-edit the resulting migration SQL so that each column is defined as a stored generated column driven by a `to_tsvector` expression over the relevant weighted fields. This way the vector is always kept in sync automatically on insert and update, with no application-level code and no database trigger required to maintain it.

Create a GIN index on each of the three generated `tsvector` columns. Additionally create a GIN trigram index using the trigram operator class on the Task title column, the Project name column, and the SubTask title column — these power the fuzzy fallback matching described below and are separate from the full-text indexes.

Run this migration under the name `add-search-indexes`.

---

## Backend — Search Module

Create a `SearchModule` inside `apps/api/src/search`. Import the Prisma service. Protect the endpoint with the JWT auth guard.

### Endpoint

#### GET /workspaces/:slug/search

Query parameters: `q` as the search text, required, with a minimum length below which the endpoint should return an empty result set immediately without touching the database. A `scope` parameter that is either `project` or `workspace`, defaulting to `workspace`. A `projectId` parameter that is required when scope is `project` and ignored otherwise.

Parse the raw `q` text defensively into a Postgres text-search query using a parsing function that tolerates unbalanced quotes, stray operators, and arbitrary punctuation without ever throwing a database error — never pass the raw user string directly into a strict tsquery constructor.

### Access Control

Before running any search, verify the authenticated user's membership the same way every other workspace- and project-scoped endpoint in this application already does. For workspace scope, only search within projects the user is a member of, except Workspace Owners and Admins who may search across every project in the workspace, consistent with the visibility rule already established for the project list in Sprint 6. For project scope, verify the user has access to that specific project before searching it at all. Never search or return results from a different workspace than the one in the URL slug, regardless of what the user might otherwise have access to.

Exclude archived projects and tasks belonging to archived projects from search results by default, consistent with how archived content is already deprioritized elsewhere in the application.

### Ranking and Matching Strategy

For each of the three entity types — Task, SubTask, Project — run two matching passes against the access-controlled set of rows. The first pass matches the parsed search query against the entity's generated `tsvector` column and ranks matches using Postgres's relevance ranking function, so title matches naturally outrank description matches due to the column weighting set up in the migration. The second pass matches the raw query text against the same entity's title or name column using trigram similarity, to catch close and typo-laden matches that the full-text pass would miss entirely because they share no common dictionary lexeme.

Merge the results of both passes per entity type, removing duplicates by entity ID, with full-text matches ranked above trigram-only matches. Combine the three entity types' results into one single flat list ordered by relevance across all of them together, and cap the total returned list at twenty results regardless of how those twenty are distributed across entity types.

For each result include: the entity type, its ID, the matched title or name text, and the information the frontend needs to navigate to it without a follow-up call — for a Task result include its project ID and project name; for a SubTask result include its own ID and title, its parent task's ID and title, and the project ID and name; for a Project result include just its own ID and name. Do not compute or return highlighted snippet markup from the backend — the frontend will handle highlighting the matched substring within the plain title text it already receives.

---

## Frontend — Search Store

Create a dedicated Zustand store for search state. It should hold the current query string, the active scope, the active project ID when scope is project, the current ranked results array, a loading boolean, and the list of recent search query strings. Create actions for setting the query, setting the scope, setting the results, and adding a query to the recent searches list. The recent searches list should persist to localStorage, cap at eight entries, stay ordered most-recent-first, and avoid storing the same query twice in a row consecutively.

---

## Frontend — Sidebar Search Input and Dropdown

Add a search input to the persistent workspace sidebar from Sprint 5, positioned directly below the workspace switcher and above the workspace navigation links. The input has a magnifying glass icon on the left and a placeholder reading something like "Search tasks, projects...". This element persists across all workspace and project routes the same way the rest of the sidebar does.

Focusing the input opens a floating dropdown panel anchored below it, layered above surrounding content. The dropdown contains:

A small scope toggle row at the top with two options, "This project" and "Workspace". Only show the "This project" option when the user currently has an active project open — meaning the current route is inside a project. When inside a project default the toggle to "This project"; when at the workspace home or any non-project route, hide the toggle entirely and only ever search workspace-wide.

When the query is empty, show a "Recent searches" section listing the stored recent queries as clickable rows, each with a small clock icon. Include a small "Clear" action at the end of this section's header that empties the recent searches list. If there are no recent searches, do not render this section at all — show nothing rather than an empty placeholder.

When the query is non-empty, debounce roughly three hundred milliseconds after the last keystroke before calling the search endpoint. While waiting or while the request is in flight show a small loading indicator inside the dropdown. Once results arrive render them as a flat list, each row showing a small entity-type label in tertiary grey on the left — Task, Sub-task, or Project — the matched title in the middle with the portion matching the typed query brightened to near-white against the surrounding secondary grey text, and for Task and SubTask rows a small project-name breadcrumb in tertiary grey on the right so the user knows which project the result belongs to. If there are zero results show a centered message inside the dropdown reading something like "No results for [query]."

The dropdown rows must be keyboard-navigable with the up and down arrow keys and selectable with Enter, in addition to being clickable with the mouse. Clicking outside the dropdown or pressing Escape closes it without clearing the typed query from the input until the user explicitly navigates to a result.

---

## Frontend — Click and Navigation Behavior

Selecting a Project result navigates to that project's Board tab.

Selecting a Task result navigates to that task's project Board tab. If the target project differs from whatever project is currently active, allow the board to fully load fresh data first. Once the task's card is present on the board, scroll it into view and apply the highlight treatment described below. Do not open the task slide-over panel in this case.

Selecting a SubTask result navigates to the parent task's project Board tab the same way. Once loaded, scroll the parent task's card into view and apply the same highlight treatment to it, and additionally open the task slide-over panel for that parent task with the Sub-tasks tab pre-selected, so the user lands directly in the relevant sub-task context rather than having to navigate there themselves.

In every case, after navigating, close the dropdown, clear the search input text, and record the executed query string into the recent searches list.

---

## Frontend — Card Highlight Treatment

Build this as a small, reusable visual treatment on the existing task card component from Sprint 9, rather than something specific only to search. It applies a temporary near-white glowing outline around the card with a brief pulse animation, automatically removing itself once the animation finishes after a couple of seconds. Implement it generically enough — for example as an optional prop or temporary class that any part of the app can trigger on a given task ID — so future "jump to and draw attention to this card" needs can reuse it without duplicating the effect.

---

## Edge Cases

A query shorter than the minimum length must never trigger a backend call; the dropdown can simply wait for more input.

Malformed or adversarial query text — unbalanced quotes, bare operators, unusual punctuation — must never cause the search endpoint to throw an error; it should always degrade to a reasonable best-effort match or an empty result set.

Search must never return results from outside the active workspace, regardless of what else the authenticated user has access to elsewhere.

If the user triggers a search while on the workspace home page with no active project, only workspace scope is available, and selecting any Task or SubTask result still correctly crosses into that result's project.

---

## Definition of Done

This sprint is complete when all of the following are true:

- The `add-search-indexes` migration runs cleanly and creates the generated `tsvector` columns, their GIN indexes, and the trigram GIN indexes
- GET /workspaces/:slug/search returns a single ranked, deduplicated, capped list combining Task, SubTask, and Project matches
- Full-text matches rank above trigram-only matches, and title or name matches rank above description matches
- Typo-laden queries still surface relevant results via the trigram fallback
- Archived projects and their tasks are excluded from results
- A user never sees a result from a project or workspace they do not have access to
- The sidebar search input and dropdown appear on every workspace and project route
- The scope toggle only shows "This project" when a project is actually active
- Typing debounces before calling the backend, and results render as a flat ranked list with entity-type labels and highlighted matched text
- Recent searches show when the input is empty and focused, persist across sessions via localStorage, and can be cleared
- Clicking a Task result navigates to the board and highlights the card without opening the panel
- Clicking a SubTask result navigates to the board, highlights the parent task card, and opens the parent task's panel on the Sub-tasks tab
- Clicking a Project result navigates to that project's board
- The highlight treatment is implemented as a reusable addition to the existing task card component
- No colors outside the black-to-white range appear anywhere in this sprint's UI

---

## Notes for Antigravity

Do not introduce Elasticsearch, Meilisearch, Typesense, or any other external search service — this feature must run entirely on the existing PostgreSQL instance. Do not build a per-keystroke uncapped query — the debounce and the twenty-result cap are both required. Do not duplicate the task card highlight effect as a one-off inline style inside the search dropdown component; build it as a reusable addition to the Sprint 9 task card so it can be triggered from anywhere. Do not extend or modify the existing Sprint 9 board filters in this sprint — global search and board filtering remain two separate systems for now. Recent searches are frontend-only state in localStorage; do not create a backend table or endpoint to persist them.
