# Task Tracker

A high-performance, real-time task management application built with modern web technologies. This monorepo uses Turborepo to orchestrate a NestJS backend, a Next.js frontend, and shared packages.

## 🚀 Architecture Overview

This project is structured as a monorepo containing the following components:

- **Frontend (`apps/web`)**: A robust Next.js 14+ application using the App Router. Features a highly optimized, responsive UI built with Tailwind CSS, Shadcn UI, and Zustand for state management. Uses TanStack Query for data fetching and caching.
- **Backend (`apps/api`)**: A scalable NestJS application. It handles business logic, real-time WebSocket connections (via Socket.IO and Redis pub/sub), and background jobs using BullMQ.
- **Database**: PostgreSQL database accessed via Prisma ORM.
- **Caching & Pub/Sub**: Redis is used for caching API responses, rate limiting, BullMQ background queues, and Socket.IO multi-node broadcasting.
- **Object Storage**: MinIO (S3-compatible) is used for storing user avatars, workspace logos, and task attachments.
- **Shared (`packages/shared`)**: Shared Zod schemas, TypeScript types, and validation logic used by both the frontend and backend.

## 🛠 Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/en/) (v18+)
- [pnpm](https://pnpm.io/) (v8+)
- [Docker](https://www.docker.com/) & Docker Compose

## 📦 Local Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Task tracker"
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up Environment Variables**
   - Copy `apps/api/.env.example` to `apps/api/.env` and configure your database, Redis, MinIO, and JWT secrets.
   - Copy `apps/web/.env.example` to `apps/web/.env.local` and configure your Next.js frontend variables.

4. **Start the Infrastructure**
   Start the required services (PostgreSQL, Redis, MinIO) using Docker Compose:
   ```bash
   docker-compose up -d
   ```

5. **Initialize the Database**
   Push the Prisma schema to your PostgreSQL database:
   ```bash
   pnpm --filter api db:push
   ```

6. **Start the Development Servers**
   Run the full stack concurrently:
   ```bash
   pnpm dev
   ```
   - The **Frontend** will be available at `http://localhost:3000`
   - The **Backend** will be available at `http://localhost:3001`
   - The **API Documentation (Swagger)** will be available at `http://localhost:3001/api/docs`

## 📜 Available Scripts

From the root directory, you can run the following Turborepo commands:

- `pnpm dev`: Starts both the Next.js frontend and NestJS backend in development mode.
- `pnpm build`: Builds all applications and packages for production.
- `pnpm lint`: Runs ESLint across all workspaces to ensure code quality.
- `pnpm --filter api db:push`: Pushes Prisma schema changes to the database.
- `pnpm --filter api db:studio`: Opens Prisma Studio to view and manage database records.

## 📂 Project Structure

```text
.
├── apps
│   ├── api              # NestJS Backend API
│   │   ├── src          # Controllers, Services, Gateways
│   │   └── prisma       # Database schema
│   └── web              # Next.js Frontend Application
│       ├── src/app      # Next.js App Router pages
│       └── src/components # Reusable React components
├── packages
│   ├── shared           # Zod schemas and TypeScript types shared across apps
│   └── eslint-config    # Shared ESLint configuration
├── docker-compose.yml   # Infrastructure setup (Postgres, Redis, MinIO)
└── turbo.json           # Turborepo build pipeline configuration
```

## ✨ Key Features

- **Real-Time Collaboration**: Instant updates for tasks, boards, and activity feeds using WebSockets.
- **Workspaces & Projects**: Organize your team and control access with role-based permissions (Admin, Member, Viewer).
- **Kanban Board**: Drag-and-drop task management powered by `dnd-kit`.
- **Calendar View**: Manage deadlines and visualize time blocks.
- **Activity Feed**: Audit logs for task changes, comments, and project updates.
- **High Performance**: Optimized bundle sizes with `next/dynamic`, image optimization with `next/image`, and Redis caching on the backend.
