# Sprint 25 — Rate Limiting (REST + Socket.IO)

## Goal
Add a comprehensive, production-grade rate limiting layer across all REST endpoints and Socket.IO events. The existing global throttler setup and auth-specific limits are already in place — this sprint refines and extends them without replacing the foundation. By the end of this sprint every sensitive endpoint and every Socket.IO event must have an appropriate per-user or per-IP rate limit, violations must be logged using the existing logger infrastructure, and all 429 responses must follow the project's consistent error shape.

---

## Guiding Principles

Rate limiting is a protection layer, not a UX punishment. Limits must be generous enough that legitimate users never hit them during normal usage, but strict enough to meaningfully block abuse. Authenticated endpoints must be limited by User ID, not IP, since IP is easily shared across offices or universities and User ID is the accurate identity. Unauthenticated endpoints are limited by IP. Socket.IO event limits must fail silently — the event is ignored and nothing is emitted back to the client. The client will naturally retry on the next window. No progressive punishment, no user suspension, no auto-ban — just clean 429s on REST and silent drops on Socket.IO, both logged.

---

## Existing Foundation — Do Not Touch

The following is already implemented and must not be modified:

- Global throttler: `100 requests per 60 seconds per IP` via `@nestjs/throttler` with `nestjs-throttler-storage-redis` backed by the existing Redis instance.
- Auth strict limits already on `POST /auth/register`, `POST /auth/login`, `POST /auth/accept-invite`: `10 requests per 60 seconds per IP`.
- These are registered globally via `APP_GUARD` in `app.module.ts`.

---

## Part 1 — Custom Throttler Key Strategy (User ID for Authenticated Routes)

### The Problem
The default throttler keys by IP. For authenticated endpoints this is wrong — a shared office IP should not cause one user's actions to block another's.

### What to Build
Create a custom throttler guard that extends `ThrottlerGuard` from `@nestjs/throttler`. Override the `getTracker` method. If the request has an authenticated user attached (i.e., `req.user.id` exists from the JWT strategy), return the user ID as the tracker key. If the request has no authenticated user, fall back to the client IP as the tracker key.

Export this guard from a shared location such as `apps/api/src/common/guards/custom-throttler.guard.ts`.

This guard must be used for all new endpoint-level rate limit decorators added in this sprint. Do not change the global `APP_GUARD` — the global guard can remain IP-based as a baseline. The custom guard is applied at the controller method level using `@UseGuards` alongside `@Throttle`.

---

## Part 2 — REST Endpoint Rate Limits

Apply the following limits using `@Throttle` decorator and the custom throttler guard described above. Each decorator specifies `ttl` in milliseconds and `limit` as the max request count.

### `auth.controller.ts`
- `POST /auth/invite` — `5 requests per 60 seconds`

### `task.controller.ts`
- `POST` comment creation endpoint — `30 requests per 60 seconds`
- `POST` task attachment upload endpoint — `10 requests per 60 seconds`

### `workspace.controller.ts`
- Workspace logo upload endpoint — `5 requests per 60 seconds`

### `user.controller.ts`
- User avatar upload endpoint — `5 requests per 60 seconds`

### `chat.controller.ts`
- Message attachment upload endpoint — `10 requests per 60 seconds`

### `conversation.controller.ts`
- Message attachment upload endpoint — `10 requests per 60 seconds`

### `calendar.controller.ts`
- `POST` meeting create endpoint — `10 requests per 60 seconds`
- `POST` conflict check endpoint — `20 requests per 60 seconds`

### `search.controller.ts`
- `GET` search endpoint — `30 requests per 60 seconds`

---

## Part 3 — 429 Response Shape

The existing project uses a consistent error response shape across all endpoints:

```json
{
  "message": "Too many requests. Please try again later.",
  "statusCode": 429,
  "timestamp": "2024-06-10T12:00:00.000Z"
}
```

Override the default `ThrottlerGuard` exception behaviour to throw a `ThrottlerException` with this exact shape. Create a custom exception filter at `apps/api/src/common/filters/throttler-exception.filter.ts` that catches `ThrottlerException` and returns the above JSON shape with an HTTP 429 status.

Additionally, include a `Retry-After` header in the 429 response. The value should be the number of seconds until the current window resets. The throttler package exposes this — use it correctly.

Register this exception filter globally in `main.ts` using `app.useGlobalFilters`.

---

## Part 4 — Violation Logging

When any rate limit is exceeded — REST or Socket.IO — log the violation using the existing NestJS `Logger` infrastructure. Do not create a new logging system.

For REST violations, log inside the custom throttler guard's overridden `throwThrottlingException` method, which is called by the throttler guard just before it throws. Log the following fields:

```
[RateLimit] VIOLATION | userId: <id or 'unauthenticated'> | ip: <ip> | endpoint: <method + path> | timestamp: <ISO string>
```

Use `Logger.warn()` with the context string `'RateLimiter'`.

For Socket.IO violations, log inside each gateway handler where the limit is exceeded (described in Part 5). Use the same log format with `event` instead of `endpoint`:

```
[RateLimit] SOCKET VIOLATION | userId: <id> | event: <event name> | timestamp: <ISO string>
```

---

## Part 5 — Socket.IO Event Rate Limiting

The Socket.IO gateway does not use the NestJS throttler package — it requires a separate Redis-based counter approach since Socket.IO events are not HTTP requests and the throttler guard does not apply to WebSocket gateways.

### Approach

Create a `SocketRateLimiterService` at `apps/api/src/common/services/socket-rate-limiter.service.ts`. Inject the existing Redis client (ioredis) from the Redis module established in Sprint 8.

The service exposes a single async method:

```typescript
async isAllowed(userId: string, event: string, limit: number, windowSeconds: number): Promise<boolean>
```

Internally this method:
1. Constructs a Redis key: `socket:ratelimit:${userId}:${event}`
2. Uses Redis `INCR` to increment the counter for this key
3. If the counter value is exactly `1` (meaning this is the first call in the window), set the key's TTL using `EXPIRE` with the `windowSeconds` value
4. Returns `true` if the counter is within the limit, `false` if it exceeds it

This approach is atomic enough for this use case and requires no Lua scripting.

### Events to Limit

In the realtime gateway (`realtime.gateway.ts`) and the presence gateway (wherever presence events are handled), wrap each of the following event handlers with a call to `socketRateLimiterService.isAllowed`. If it returns `false`, log the violation and return immediately without processing the event.

| Event | Limit | Window |
|---|---|---|
| `presence:heartbeat` | 3 | 60 seconds |
| `presence:set_away` | 5 | 60 seconds |
| `presence:set_active` | 5 | 60 seconds |
| `board:presence_join` | 10 | 60 seconds |
| `board:presence_leave` | 10 | 60 seconds |
| `task:presence_join` | 10 | 60 seconds |
| `task:presence_leave` | 10 | 60 seconds |
| `comment:typing_start` | 20 | 60 seconds |
| `comment:typing_stop` | 20 | 60 seconds |
| `chat:message_created` | 30 | 60 seconds |
| `project:join` | 10 | 60 seconds |
| `project:leave` | 10 | 60 seconds |

### Failure Behaviour
If the Redis call inside `isAllowed` fails for any reason (Redis down, timeout), the method must return `true` — meaning allow the event through. Never block legitimate traffic because the rate limiter's backing store is temporarily unavailable. Log a warning if this fallback is triggered.

---

## Part 6 — No Frontend Changes

This sprint is entirely backend. No frontend UI changes are needed. The frontend already handles 429 responses gracefully via the existing Axios response interceptor — a 429 is not a 401, so it will not trigger a token refresh loop. It will surface as a failed request which the caller handles as any other error.

Do not add any toast, banner, or UI indicator specifically for rate limit errors on the frontend. The existing error handling is sufficient.

---

## File Summary — What Changes

| File | Change |
|---|---|
| `apps/api/src/common/guards/custom-throttler.guard.ts` | **New** — User-ID-aware throttler guard |
| `apps/api/src/common/filters/throttler-exception.filter.ts` | **New** — 429 response shape + Retry-After header |
| `apps/api/src/common/services/socket-rate-limiter.service.ts` | **New** — Redis INCR based Socket.IO limiter |
| `apps/api/src/main.ts` | **Modify** — register the exception filter globally |
| `apps/api/src/auth/auth.controller.ts` | **Modify** — add limit on `POST /auth/invite` |
| `apps/api/src/task/task.controller.ts` | **Modify** — add limits on comment post and attachment upload |
| `apps/api/src/workspace/workspace.controller.ts` | **Modify** — add limit on logo upload |
| `apps/api/src/user/user.controller.ts` | **Modify** — add limit on avatar upload |
| `apps/api/src/chat/chat.controller.ts` | **Modify** — add limit on message attachment upload |
| `apps/api/src/conversation/conversation.controller.ts` | **Modify** — add limit on message attachment upload |
| `apps/api/src/calendar/calendar.controller.ts` | **Modify** — add limits on meeting create and conflict check |
| `apps/api/src/search/search.controller.ts` | **Modify** — add limit on search endpoint |
| `apps/api/src/realtime/realtime.gateway.ts` | **Modify** — inject SocketRateLimiterService and apply limits on all Socket.IO events listed above |

---

## Definition of Done

This sprint is complete when all of the following are true:

- The custom throttler guard keys by User ID for authenticated requests and falls back to IP for unauthenticated ones
- All REST endpoints listed in Part 2 return a proper 429 with the consistent JSON shape and `Retry-After` header when their limits are exceeded
- The global 100/min baseline and existing auth limits are untouched and still working
- The `SocketRateLimiterService` is wired into the gateway and all Socket.IO events listed in Part 5 are silently dropped when limits are exceeded
- Every violation — REST and Socket.IO — is logged via `Logger.warn()` with the specified format
- If Redis is unavailable, the Socket.IO limiter fails open (allows traffic) and logs a warning
- No frontend changes are made in this sprint
- No existing functionality is broken — all integration tests for auth, tasks, chat, and calendar still pass

---

## Notes for Antigravity

Do not replace or remove the existing global `APP_GUARD` throttler setup. Only extend it. Do not use Lua scripting in Redis for the socket rate limiter — the simple INCR + EXPIRE pattern is sufficient and easier to reason about. Do not install any new npm packages — `@nestjs/throttler`, `nestjs-throttler-storage-redis`, and `ioredis` are already installed. The `SocketRateLimiterService` must inject the existing ioredis client from the Redis module — do not create a second Redis connection. Keep the `common` directory clean: guard, filter, and service each in their own file with single responsibility.
