# Personal WHOOP Coach

A private ChatGPT app that connects to one WHOOP account, refreshes data in the background, and produces baseline-aware training and recovery coaching.

## What it includes

- WHOOP OAuth with the `offline` scope and rotation-safe refresh token handling
- AES-256-GCM encryption for WHOOP access and refresh tokens
- WHOOP v2 cycles, recoveries, sleeps, workouts, and body measurements
- Signed v2 webhooks for fast sleep, recovery, and workout updates
- Hourly reconciliation for missed webhooks and cycle data
- A ChatGPT MCP endpoint protected by OAuth 2.1 through Auth0
- An interactive coaching dashboard with recovery, HRV, resting heart rate, sleep, trends, and next actions
- A personal profile tool for sport, goals, schedule, event date, and injury constraints
- Standard `search` and `fetch` tools for daily coaching history

This is training guidance, not medical diagnosis or treatment.

## Architecture

The service intentionally uses two OAuth relationships:

1. **ChatGPT → this MCP server:** Auth0 issues the user access token and lets ChatGPT authenticate to `/mcp` using the MCP OAuth requirements.
2. **This service → WHOOP:** WHOOP grants read access to your physiological data. WHOOP tokens are encrypted in PostgreSQL.

WHOOP itself is not used as the MCP authorization server because ChatGPT's authenticated MCP flow requires additional OAuth discovery and client-registration behavior.

## Local setup

### 1. Create PostgreSQL and configure the app

Copy `.env.example` to `.env`. Generate a token-encryption key without saving it to shell history when possible:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Place the result in `TOKEN_ENCRYPTION_KEY`. Never commit `.env`.

Install and migrate:

```powershell
pnpm install
pnpm db:migrate
```

### 2. Register a WHOOP developer app

In the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/):

- Set the redirect URL to `https://YOUR_PUBLIC_HOST/oauth/whoop/callback`.
- Set a v2 webhook URL to `https://YOUR_PUBLIC_HOST/webhooks/whoop`.
- Copy the client ID and secret into `.env`.
- Keep the `offline` scope; it is required for periodic refresh.

### 3. Configure Auth0 for MCP authentication

Create an Auth0 API whose identifier matches `AUTH0_AUDIENCE` and add the `whoop:read` permission. Configure Auth0 for MCP authorization-code + PKCE, metadata discovery, and ChatGPT client registration by following Auth0's MCP resource-server guidance linked from the [OpenAI authentication guide](https://developers.openai.com/apps-sdk/build/auth).

For a personal deployment, set `AUTH0_ALLOWED_SUBJECT` to your Auth0 `sub`. The server then rejects valid tokens belonging to anyone else.

### 4. Start locally and expose HTTPS

```powershell
pnpm dev
```

The local MCP endpoint is `http://localhost:8787/mcp`. ChatGPT needs a public HTTPS endpoint, so expose port 8787 with a trusted tunnel during development and update `PUBLIC_BASE_URL`, `WHOOP_REDIRECT_URI`, and Auth0's audience/allowed URLs.

### 5. Add the private app in ChatGPT

Availability depends on your ChatGPT plan and workspace settings.

1. Enable Developer Mode in ChatGPT app settings.
2. Create a custom app and enter `https://YOUR_PUBLIC_HOST/mcp`.
3. Complete the Auth0 sign-in.
4. Ask: “Show my WHOOP coaching dashboard.”
5. Select **Connect WHOOP** in the dashboard and approve the requested read scopes.

Refresh the custom app in ChatGPT after changing tool schemas or widget metadata.

## Production operation

- Deploy the Docker image behind stable HTTPS; do not use a development tunnel permanently.
- Run `pnpm db:migrate` during deployment.
- Keep exactly one in-process scheduler replica, or move reconciliation to a platform cron job if scaling the web service horizontally.
- Configure WHOOP's webhook to the production URL and retain the hourly reconciliation job. WHOOP warns that webhook events may be duplicated or missed.
- Set `AUTH0_ALLOWED_SUBJECT` for this personal app.
- Store `DATABASE_URL`, WHOOP credentials, and `TOKEN_ENCRYPTION_KEY` in the host's secret manager.
- Alert on failed syncs and repeated token refresh failures without logging token values, profile identifiers, or health payloads.

## Deploy on Render

The included `render.yaml` creates a Docker web service and a private Render Postgres database in Virginia. It uses a continuously running Starter web instance because a sleeping free instance cannot reliably execute the hourly WHOOP reconciliation schedule. The database uses Render's smallest current Basic instance; review Render's displayed price before confirming the Blueprint.

After the GitHub repository exists:

1. In Render, choose **New → Blueprint** and select the `whoop-coach` repository.
2. Render reads `render.yaml` and prompts for the `sync: false` values.
3. Use the final Render hostname for:
   - `PUBLIC_BASE_URL`: `https://YOUR-SERVICE.onrender.com`
   - `WHOOP_REDIRECT_URI`: `https://YOUR-SERVICE.onrender.com/oauth/whoop/callback`
   - Auth0 API audience: the same value used for `AUTH0_AUDIENCE`
4. Supply the Auth0 issuer, audience, personal subject, and WHOOP client credentials.
5. Confirm the Blueprint. The pre-deploy command applies `schema.sql` before the service starts.
6. Add `https://YOUR-SERVICE.onrender.com/webhooks/whoop` as a v2 webhook in the WHOOP Developer Dashboard.
7. Verify `https://YOUR-SERVICE.onrender.com/health`, then add `https://YOUR-SERVICE.onrender.com/mcp` as the private ChatGPT app endpoint.

Render automatically redeploys successful commits to the repository's default branch.

## Coaching approach

The engine uses within-person baselines rather than population comparisons:

- 28-day median HRV and resting heart rate
- 14-day average sleep performance
- 7-day average strain
- WHOOP recovery bands, moderated when HRV is suppressed or resting heart rate is elevated
- Conservative recommendations when multiple recovery signals deteriorate together

The rules are deliberately interpretable. ChatGPT can combine these computed signals with your saved goals and schedule when explaining or adjusting the recommendation.

## Commands

```powershell
pnpm check
pnpm test
pnpm build
pnpm dev
```

## Data deletion

Revoking the WHOOP app stops future access. For complete deletion, remove the corresponding `app_users` row; cascading foreign keys remove tokens, cached records, OAuth states, and the coaching profile.
