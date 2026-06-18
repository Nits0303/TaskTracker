# Sprint 1 — Monorepo + Dev Environment Setup

## Goal
Set up the complete monorepo foundation that every future sprint will build on. By the end of this sprint, the entire development environment must be running locally with all services connected and talking to each other. No features yet, just a rock-solid base.

---

## Monorepo Structure

Use Turborepo to manage the monorepo. The root of the project should have a `apps` folder and a `packages` folder. Inside `apps`, create two workspaces: one called `web` for the Next.js frontend and one called `api` for the NestJS backend. Inside `packages`, create one shared package called `shared` which will hold Zod schemas and TypeScript types that both apps will import from.

The root should have a single `turbo.json` that defines the pipeline for `build`, `dev`, `lint` and `test` tasks. The `dev` task should run all apps in parallel. Each app should have its own `package.json` with its own dependencies. The shared package should also have its own `package.json` and should be importable by both apps as `@repo/shared`.

---

## Frontend — Next.js App

Scaffold a Next.js 15 app inside `apps/web` using the App Router. Install the following dependencies: Tailwind CSS, Zustand, TanStack Query, Zod, Socket.IO client, and Axios. Configure Tailwind with a custom theme using only black-to-white shades. The design system must be strictly monochromatic — no color accents, no blues, no greens, no reds anywhere in the base configuration. The palette should range from pure black at one end to pure white at the other, with carefully chosen grey steps in between for backgrounds, borders, text hierarchy and interactive states.

Set up a global CSS file with CSS variables for the entire design token system. Define tokens for background levels (at least three levels of depth from darkest to lightest), border colors (subtle and strong), and text colors (primary, secondary, tertiary, disabled). Everything in the UI will reference these tokens rather than hardcoded colors.

The default theme is dark. The root background should be near-black. Cards and panels should be a slightly lighter dark grey. Borders should be very subtle dark grey lines. Primary text should be near-white. Secondary text should be mid-grey. Tertiary text should be dark grey.

Create a root layout file that wraps the app in a TanStack Query provider and sets the dark background on the html element. Create a placeholder home page that simply shows the app name centered on screen to confirm the setup is working.

---

## Backend — NestJS App

Scaffold a NestJS app inside `apps/api`. Install the following dependencies: Prisma, Passport.js, passport-jwt, passport-google-oauth20, jsonwebtoken, bcrypt, Socket.IO server via the NestJS WebSockets package, ioredis, and the NestJS config module.

Create a basic app module. Create a health check endpoint at `GET /health` that returns a JSON object with status ok and a timestamp. This is just to confirm the server is running.

Set up environment variable handling using the NestJS config module. Create a `.env.example` file at the root of the api app listing all the environment variables the app will need. These should include database URL, JWT secret, JWT refresh secret, Google OAuth client ID and secret, Redis URL, and MinIO credentials. Do not hardcode any of these values anywhere in the code.

---

## Database — PostgreSQL via Docker

Create a `docker-compose.yml` file at the monorepo root. It should spin up three services: PostgreSQL, Redis, and MinIO.

PostgreSQL should run on the default port and have a database name, user, and password defined via environment variables. Redis should run on its default port with no authentication for local development. MinIO should run with a root user and password defined via environment variables, expose both the API port and the console port, and use a local volume for data persistence.

All three services should be on the same Docker network so they can reference each other by service name.

---

## Prisma Setup

Inside `apps/api`, initialise Prisma with PostgreSQL as the provider. The `schema.prisma` file should have the correct database URL pointing to the Docker PostgreSQL instance. Do not define any models yet — that is Sprint 2. Just confirm Prisma is connected by running `prisma db push` successfully against the empty database.

Generate the Prisma client and make sure it is importable inside the NestJS app. Create a dedicated Prisma service in NestJS that extends the Prisma client and handles `onModuleInit` and `onModuleDestroy` lifecycle hooks for clean connection management.

---

## Shared Package

Inside `packages/shared`, set up a bare TypeScript package. Install Zod as a dependency. Create an `index.ts` that exports nothing yet but is correctly set up for future Zod schema exports. Make sure both `apps/web` and `apps/api` can successfully import from `@repo/shared` without TypeScript errors.

---

## Scripts

At the monorepo root level, the following scripts should work:

- `pnpm dev` — starts all apps and watches for changes in parallel via Turborepo
- `pnpm build` — builds all apps
- `pnpm lint` — lints all apps
- `docker-compose up -d` — starts PostgreSQL, Redis, and MinIO in the background

---

## Definition of Done

This sprint is complete when all of the following are true:

- Running `pnpm dev` starts both the Next.js frontend and the NestJS backend without errors
- The frontend loads in the browser showing the placeholder home page with the dark monochromatic theme applied
- The backend health check endpoint returns status ok when hit
- Docker Compose brings up PostgreSQL, Redis, and MinIO without errors
- Prisma can connect to PostgreSQL and `prisma db push` runs successfully
- Both apps can import from `@repo/shared` without errors
- No hardcoded secrets anywhere — everything reads from environment variables
- The `.env.example` file documents every required variable

---

## Notes for Antigravity

Do not implement any authentication, database models, or UI pages in this sprint. The sole purpose is infrastructure. Keep every file as lean as possible. If a choice has to be made between two valid approaches, always pick the simpler one. The goal is a clean, working foundation that future sprints can build on without friction.

The dark monochromatic design system set up in this sprint is the visual foundation for the entire application. Every shade used in future sprints must come from the CSS variable tokens defined here. No raw color values should ever appear in component files.
