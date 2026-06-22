# Sprint 25 — Advanced Health Check (terminus)

## Goal
Upgrade the existing basic `/health` endpoint to a production-grade health check using `@nestjs/terminus`. The upgraded endpoint must actively probe every critical dependency — PostgreSQL, Redis, MinIO, and BullMQ queues — and report their individual status and response times. The existing `GET /health` route must be preserved but its response upgraded. No new routes, no external services, no new infrastructure.

---

## Guiding Principles

A health check must reflect the true state of the application. Returning `{ status: "ok" }` when Redis is down or the database is unreachable is worse than no health check at all — it creates false confidence. Every dependency must be actively probed on every health check call. The endpoint must respond quickly — each probe must have a short timeout so a slow dependency does not cause the health check itself to hang. If any single dependency is down, the overall status must reflect `error` and the HTTP response code must be `503 Service Unavailable` so Docker and any future monitoring tool can react correctly.

---

## Part 1 — Install `@nestjs/terminus`

Install the package in `apps/api`:

```bash
pnpm add @nestjs/terminus
```

No other new packages are needed. The existing `ioredis` client, Prisma client, and MinIO client already provide the connection instances the custom indicators will use.

---

## Part 2 — Health Module

Create `apps/api/src/health/health.module.ts` and `apps/api/src/health/health.controller.ts`.

Import `TerminusModule` from `@nestjs/terminus` into `HealthModule`. Import the existing `PrismaModule`, `RedisModule`, and any module that exposes the MinIO client and BullMQ queues so their providers can be injected into the custom health indicators.

Register `HealthModule` in `app.module.ts`. Remove the existing basic health check from `app.controller.ts` — the new controller replaces it entirely.

---

## Part 3 — Health Controller

The controller exposes a single endpoint:

### GET /health

No authentication required — health checks must be publicly accessible so Docker, load balancers, and monitoring tools can call them without credentials.

Use the `@nestjs/terminus` `HealthCheck` decorator and `HealthCheckService.check()` method to run all indicators in parallel. The response shape must be:

```json
{
  "status": "ok",
  "timestamp": "2024-06-10T12:00:00.000Z",
  "services": {
    "database": {
      "status": "up",
      "responseTime": "12ms"
    },
    "redis": {
      "status": "up",
      "responseTime": "2ms"
    },
    "minio": {
      "status": "up",
      "responseTime": "45ms"
    },
    "bullmq:activity-feed": {
      "status": "up"
    },
    "bullmq:notifications": {
      "status": "up"
    },
    "memory": {
      "status": "up",
      "heapUsed": "87MB",
      "heapTotal": "256MB"
    }
  }
}
```

When any service is down:

```json
{
  "status": "error",
  "timestamp": "2024-06-10T12:00:00.000Z",
  "services": {
    "database": {
      "status": "up",
      "responseTime": "10ms"
    },
    "redis": {
      "status": "down",
      "message": "Connection refused"
    },
    ...
  }
}
```

HTTP status code must be `200` when all services are up and `503` when any service is down or degraded. This is handled automatically by `@nestjs/terminus` — do not manually set the status code.

---

## Part 4 — Custom Health Indicators

Create each indicator as a separate injectable service inside `apps/api/src/health/indicators/`.

### `prisma.health.ts` — Database Indicator

Inject the existing `PrismaService`. In the `isHealthy()` method run a raw query `SELECT 1` using `prisma.$queryRaw`. Measure the time taken using `Date.now()` before and after. Return the result with the response time in milliseconds formatted as a string like `"12ms"`. If the query throws or times out, return a down status with the error message. Set a timeout of 3000ms — if the query has not completed within 3 seconds treat it as down.

### `redis.health.ts` — Redis Indicator

Inject the existing ioredis client from the Redis module established in Sprint 8. In the `isHealthy()` method call `redis.ping()`. Measure response time. If it returns `PONG` the service is up. If it throws or times out (3000ms timeout), return down with the error message.

### `minio.health.ts` — MinIO Indicator

Inject the existing MinIO client. In the `isHealthy()` method call `minioClient.listBuckets()`. Measure response time. If it resolves without error, the service is up. If it throws or times out (5000ms timeout — MinIO can be slightly slower to respond), return down with the error message.

### `bullmq.health.ts` — BullMQ Queue Indicator

Inject the existing ioredis client. BullMQ queues are backed by Redis, so checking BullMQ health means verifying the queue keys are reachable in Redis. For each queue name (`activity-feed` and `notifications`), attempt to get the queue's waiting count using the BullMQ `Queue` class instantiated with the existing Redis connection. If the call succeeds the queue is up. If it throws, return down. Each queue is reported as a separate key in the response — `bullmq:activity-feed` and `bullmq:notifications`. Set a 3000ms timeout.

### Memory Indicator

Use the built-in `MemoryHealthIndicator` from `@nestjs/terminus` directly — no custom indicator needed. Configure it to check that heap usage does not exceed 300MB. Also report the current heap used and heap total in the response for observability. Format both values as human-readable strings like `"87MB"`.

---

## Part 5 — Timeout Handling

Each custom indicator must implement its own timeout using `Promise.race` with a timeout promise rather than relying on the dependency's own timeout. This ensures the health check always responds within a predictable time even if a dependency hangs indefinitely.

Example pattern for each indicator:

```typescript
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Health check timed out')), 3000)
);

try {
  const start = Date.now();
  await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
  const responseTime = `${Date.now() - start}ms`;
  return this.getStatus('database', true, { responseTime });
} catch (error) {
  return this.getStatus('database', false, { message: error.message });
}
```

---

## Part 6 — Docker Compose Integration

Update `docker-compose.yml` at the monorepo root to add a `healthcheck` directive to the `api` service:

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

This tells Docker to call `/health` every 30 seconds. If it fails 3 times consecutively Docker marks the container as unhealthy. `start_period: 40s` gives the NestJS app time to boot before health checks begin.

Also add `curl` to the api service's Dockerfile if it is not already present, since the healthcheck uses it. If the api service uses a Node Alpine base image, add `apk add --no-cache curl` to the Dockerfile.

---

## Part 7 — Remove Old Health Check

Remove the existing `GET /health` handler from `app.controller.ts`. If `app.controller.ts` becomes empty after removal, delete the file entirely and remove its reference from `app.module.ts`. The new `HealthController` in the `HealthModule` fully replaces it.

---

## File Summary — What Changes

| File | Change |
|---|---|
| `apps/api/src/health/health.module.ts` | **New** |
| `apps/api/src/health/health.controller.ts` | **New** |
| `apps/api/src/health/indicators/prisma.health.ts` | **New** |
| `apps/api/src/health/indicators/redis.health.ts` | **New** |
| `apps/api/src/health/indicators/minio.health.ts` | **New** |
| `apps/api/src/health/indicators/bullmq.health.ts` | **New** |
| `apps/api/src/app.module.ts` | **Modify** — import HealthModule, remove old health check reference |
| `apps/api/src/app.controller.ts` | **Modify or Delete** — remove old `/health` handler |
| `docker-compose.yml` | **Modify** — add healthcheck directive to api service |
| `apps/api/Dockerfile` | **Modify** — add curl if not present |

---

## Definition of Done

This sprint is complete when all of the following are true:

- `GET /health` returns `200` with all six service statuses when everything is running
- `GET /health` returns `503` with the correct service marked as `down` when PostgreSQL, Redis, or MinIO is stopped
- Response times are included for database, Redis, and MinIO indicators
- Memory heap usage is reported in human-readable format
- Both BullMQ queues are reported independently
- Each indicator has a timeout — no single slow dependency can hang the health check beyond its configured timeout
- The Docker Compose `healthcheck` directive is in place and `docker inspect` shows the api container as healthy
- The old basic health check in `app.controller.ts` is removed
- No authentication is required to call `/health`
- No new external services or infrastructure are introduced

---

## Notes for Antigravity

Do not install `@nestjs/axios` or any HTTP-based health indicator — all checks are direct client calls using existing injected instances. Do not create a new Redis or MinIO connection inside the health indicators — always inject and reuse the existing singleton clients from their respective modules. The `TerminusModule` handles the aggregation of all indicator results and the 503 response code automatically — do not manually set HTTP status codes in the controller. The `Promise.race` timeout pattern must be applied to every custom indicator — never trust a dependency to respect its own timeout under failure conditions.
