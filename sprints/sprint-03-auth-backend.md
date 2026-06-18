# Sprint 3 — Auth Backend (JWT + Refresh Tokens + Google OAuth)

## Goal
Build the complete authentication backend. By the end of this sprint the API must be able to register a user, log them in, issue access and refresh tokens, rotate refresh tokens silently, handle Google OAuth, accept workspace invites, and log users out. No frontend work in this sprint.

---

## Guiding Principles

Never store plain text passwords. Never return passwords or refresh tokens in API responses. Access tokens should be short-lived. Refresh tokens should be long-lived but rotated on every use so that a stolen refresh token can only be used once. All protected routes must be guarded by a JWT strategy that validates the access token on every request.

---

## Module Structure

Create an `AuthModule` inside `apps/api/src/auth`. This module owns everything related to authentication. It should import the Prisma service, the config module, and Passport. It should export the JWT strategy so other modules can use the auth guard.

---

## Password Hashing

Use bcrypt with a salt round of twelve for hashing passwords. Never use a lower value. Create a small utility function inside the auth module that handles hashing and a separate one that handles comparison. These should be used in the register and login flows respectively.

---

## Token Strategy

Generate two tokens for every successful login or register:

The access token should be a signed JWT containing the user ID and email as the payload. It should expire in fifteen minutes. Sign it with the JWT secret from environment variables.

The refresh token should be a signed JWT containing only the user ID. It should expire in seven days. Sign it with a separate refresh secret from environment variables — never the same secret as the access token.

After generating the refresh token, hash it using bcrypt and store the hashed version in the User record in the database. Never store the raw refresh token. When rotating, compare the incoming raw refresh token against the stored hash using bcrypt comparison.

---

## Endpoints to Build

### POST /auth/register
Accept a full name, email, and password in the request body. Validate the body using the Zod schema from `@repo/shared`. Check if the email is already taken — if so return a four hundred nine conflict error. Hash the password. Create the user in the database. Generate access and refresh tokens. Store the hashed refresh token on the user record. Return the access token in the response body and set the refresh token as an HTTP-only cookie with secure and sameSite strict flags. Also return basic user info: id, name, email, avatar URL.

### POST /auth/login
Accept email and password. Validate the body. Find the user by email — if not found return a four hundred one unauthorised error with a generic message that does not reveal whether the email exists. Compare the submitted password against the stored hash. If it does not match return the same generic unauthorised error. Generate fresh access and refresh tokens. Rotate the refresh token in the database. Return the same shape as register.

### POST /auth/refresh
This endpoint should not require the JWT auth guard. Read the refresh token from the HTTP-only cookie. If the cookie is missing return four hundred one. Find the user by decoding the refresh token payload to get the user ID. Compare the raw refresh token from the cookie against the hashed one stored in the database. If they do not match return four hundred one and clear the stored hash — this indicates a token reuse attack. Generate new access and refresh tokens, rotate the stored hash, set the new cookie, and return the new access token in the body.

### POST /auth/logout
Requires the JWT auth guard. Clear the refresh token cookie. Set the stored refresh token hash on the user record to null. Return a success message.

### GET /auth/google
Initiate Google OAuth flow. Use Passport Google strategy. Request scopes for profile and email.

### GET /auth/google/callback
Handle the Google OAuth callback. If a user with this Google email already exists, log them in by generating tokens and rotating the refresh token. If they do not exist, create a new user with their Google name, email, and avatar URL from the Google profile, set the googleAuth flag to true, and set password to null. Then generate tokens and proceed the same way as login. Redirect to the frontend dashboard URL after setting the cookie.

### POST /auth/accept-invite
Accept a token string from the request body. Find the matching Invite record. Check that it has not been used and has not expired — if either condition fails return four hundred bad request with a clear message. Check if the invited email already has an account. If they do, add them to the workspace with the role from the invite, mark the invite as used, and return success. If they do not have an account, also accept a name and password in the body, create the user, add them to the workspace, mark the invite as used, generate tokens, and return the auth response.

---

## Passport Strategies

### JWT Strategy
Create a Passport JWT strategy that extracts the bearer token from the Authorization header. Validate it against the JWT secret. On success attach the decoded payload to the request object as `req.user`. This strategy will be used by the JWT auth guard applied to all protected routes.

### Google Strategy
Create a Passport Google OAuth2 strategy using the client ID and secret from environment variables. The callback URL should point to the Google callback endpoint. The validate method should return the Google profile containing the email, display name, and photo URL.

---

## Auth Guard

Create a reusable `JwtAuthGuard` that extends the Passport auth guard for the JWT strategy. This guard will be applied to every protected route in future sprints. Also create a decorator called `CurrentUser` that extracts `req.user` from the request context so controllers can access the authenticated user cleanly without manually reading the request object.

---

## Invite Sending

Create an endpoint at `POST /auth/invite` that is protected by the JWT auth guard. Accept an email and a role in the request body. Check that the authenticated user is an Owner or Admin of the workspace — if not return four hundred three forbidden. Generate a cryptographically random invite token using Node's crypto module. Create an Invite record in the database with a twenty four hour expiry. For now log the invite URL to the console in the format of the frontend base URL followed by `/accept-invite?token=` followed by the token. Email sending will be wired in Sprint 15 — just log it for now.

---

## Error Handling

All auth errors should return consistent JSON shapes with a `message` field. Never expose internal error details, stack traces, or database error messages to the client. Use NestJS built-in HTTP exceptions for all error responses.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Registering a new user via POST /auth/register creates the user in the database and returns an access token with a refresh cookie
- Logging in via POST /auth/login with correct credentials returns fresh tokens
- Logging in with wrong credentials returns a generic four hundred one with no information leak
- POST /auth/refresh with a valid cookie returns a new access token and rotates the cookie
- Using the same refresh token twice after it has been rotated returns four hundred one and clears the stored hash
- POST /auth/logout clears the cookie and nulls the stored hash
- GET /auth/google initiates the OAuth redirect without errors
- GET /auth/google/callback completes the flow and redirects correctly
- POST /auth/accept-invite with a valid unexpired token adds the user to the workspace
- POST /auth/invite creates an invite record and logs the URL
- All protected routes return four hundred one when called without a valid access token
- No passwords or raw refresh tokens appear anywhere in API responses or logs

---

## Notes for Antigravity

Do not build any frontend in this sprint. Do not wire up email sending — that is Sprint 15. Do not create any workspace or project endpoints — those are Sprints 5 and 6. Keep all auth logic strictly inside the AuthModule. The Prisma service should be injected, never instantiated directly. Every environment variable must be read through the NestJS config service, never through `process.env` directly in business logic.
