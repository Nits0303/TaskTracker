# Sprint 4 — Auth Frontend (Login, Register, Invite Flow)

## Goal
Build the complete authentication frontend. By the end of this sprint users must be able to register with a multi-step flow, log in with email and password or Google OAuth, accept a workspace invite, and reset their password. All pages must use the dark monochromatic design system established in Sprint 1. No colors outside the black-to-white range anywhere.

---

## Guiding Principles

All auth pages share the same centered card layout. The card sits on the near-black root background. The card itself should be a slightly lighter dark grey with a very subtle border. Typography should be clean and minimal. Interactive elements like inputs and buttons should have clear but restrained hover and focus states using only grey shades. Error states use a light grey text with no red — keep everything within the monochromatic palette.

Inputs should have a visible but subtle border that brightens slightly on focus. The primary action button should be near-white background with near-black text — this is the highest contrast element on the page and acts as the visual anchor. Secondary and ghost buttons should use dark grey borders with grey text.

All forms must be validated on the client side using the Zod schemas imported from `@repo/shared` before any network request is made. Inline error messages should appear below each field that fails validation. Errors from the API should appear as a banner at the top of the form.

---

## State Management for Auth

Create a Zustand store for auth state. It should hold the current user object (id, name, email, avatar URL), a boolean for whether the user is authenticated, and a boolean for whether the initial auth check is loading. Create actions for setting the user, clearing the user on logout, and updating the user profile.

Create a TanStack Query custom hook for each auth mutation: register, login, logout, and refresh. The refresh hook should be called silently on app load to restore the session from the HTTP-only cookie without requiring the user to log in again on every page visit.

Create a utility Axios instance configured with the API base URL from environment variables. This instance should attach the access token from the Zustand store as a Bearer token on every request. It should also have a response interceptor that watches for four hundred one errors, attempts a silent token refresh via the refresh endpoint, and retries the original request once with the new access token. If the refresh also fails, clear the auth store and redirect to login.

---

## Route Protection

Create a higher-order component or a wrapper component called `ProtectedRoute` that checks the auth store. If the user is not authenticated and the initial load is complete, redirect to the login page. If the initial load is still in progress, show a full-screen dark loader — just a subtle animated spinner or pulsing dots in grey on the dark background, nothing elaborate. Wrap all authenticated app routes with this component.

Create an `AuthRoute` wrapper for the opposite case — if a user is already authenticated and tries to visit login or register, redirect them to the workspace home page.

---

## Pages to Build

### Login Page — `/login`

A centered card with the app logo or name at the top. Below that a Google OAuth button that is full width. The Google button should show the Google SVG logo on the left and the text "Continue with Google" — style it with a dark grey border and slightly lighter background on hover. A divider with the word "or" between two horizontal lines separates OAuth from the email form.

Below the divider, an email input and a password input. A "Forgot password?" text link aligned to the right below the password field. A full-width primary sign in button. At the bottom a line of text saying "No account?" with a link to the register page.

When the form is submitted, validate with Zod first. If valid, call the login mutation. On success, store the returned user and access token in the Zustand store and navigate to the workspace home page. On failure, show the API error message in a banner at the top of the form.

### Register Page — `/register`

A three-step flow. Show a step indicator at the top of the card with three numbered dots connected by lines. The active step dot should be near-white. Completed step dots should show a checkmark. Future step dots should be dark grey.

Step one is account details. Show a Google sign up button, a divider, then inputs for full name, email, and password. The password field should have a toggle to show or hide the value. Validate all three fields before allowing the user to proceed to step two. If the user clicks Continue with Google, skip steps one and two entirely and go straight to step three after the OAuth flow completes.

Step two is workspace setup. Show a logo upload area — a square dashed border box that says "Upload logo" with an upload icon. Below that an input for workspace name and an input for the workspace slug. The slug should auto-populate from the workspace name by converting it to lowercase and replacing spaces with hyphens as the user types. The user can manually override the slug. Below that an optional textarea for inviting teammates by email, comma separated. A Back button and a Create workspace button.

Step three is the success screen. Show a celebration emoji or icon, a heading saying the workspace is ready, a summary card showing the workspace name and slug, and a button to go to the workspace.

### Accept Invite Page — `/accept-invite`

Read the token from the URL query parameter. On page load, call an endpoint to validate the token and get the invite details — the workspace name, the inviter's name, and the role being assigned. Show a loading state while this is in flight.

If the token is invalid or expired, show an error card with a message explaining the invite has expired and a link to the login page.

If the token is valid, show the invite card. Display the inviter's initials in a large avatar circle. Show the workspace name prominently. Show the assigned role as a small badge. Show the expiry countdown — time remaining until the invite expires displayed as hours and minutes.

Below that show a Google accept button, a divider, and then a name input and password input for creating a new account. At the very bottom a line saying "Already have an account?" with a link to login. On submission create the account and join the workspace in one call, then redirect to the workspace home.

### Reset Password Page — `/reset-password`

A simple centered card. An input for email address. A primary button to send the reset link. On submission show a success state telling the user to check their email. A back to login link. This just calls an API endpoint for now — the actual email sending is Sprint 15.

---

## Loading and Transition States

Every form button should show a loading spinner inside it while the mutation is in flight. Disable the button during loading to prevent double submission. The spinner should be a simple rotating arc in the button's text color — keep it subtle.

Page transitions between auth pages should be a simple fade. Do not use elaborate animations. The focus is on clarity and speed.

---

## Environment Variables

Add `NEXT_PUBLIC_API_URL` to the frontend environment pointing to the NestJS backend. Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for the frontend to know when Google is available. Both should be in a `.env.local` file at the `apps/web` root and documented in a `.env.example`.

---

## Definition of Done

This sprint is complete when all of the following are true:

- Visiting `/login` shows the login page with Google button and email form
- Submitting the login form with valid credentials authenticates the user and redirects to workspace home
- Submitting with invalid credentials shows an error banner
- Visiting `/register` shows the three-step flow and all three steps work end to end
- The slug field auto-generates from the workspace name
- Visiting `/accept-invite?token=xxx` with a valid token shows the invite card with countdown
- Visiting with an expired or invalid token shows the error state
- Visiting `/reset-password` submits the email and shows the success state
- Refreshing the page while logged in restores the session silently without redirecting to login
- Visiting `/login` while already authenticated redirects to workspace home
- Visiting any protected route while unauthenticated redirects to `/login`
- All form validation runs client-side before any network request
- No color values outside the black-to-white range appear anywhere in these pages

---

## Notes for Antigravity

Do not build the workspace home page or any post-login pages in this sprint — just redirect to a placeholder route. The Axios interceptor and token refresh logic are critical — implement them carefully as every future API call depends on them. The Zustand auth store shape defined in this sprint will be used by every other feature sprint, so keep it clean and well-typed with TypeScript interfaces. Import all validation schemas from `@repo/shared` — never redefine them in the frontend.
