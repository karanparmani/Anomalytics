# Execution and verification artifact

## Impact assessment

This change creates a new, isolated `whoop-coach` application and does not modify the existing banking analytics application. It adds a TypeScript MCP server, inline coaching widget, PostgreSQL schema, WHOOP OAuth/API adapter, encrypted token storage, webhook handling, periodic reconciliation, interpretable coaching rules, Docker packaging, and setup documentation. The application exposes only authenticated health-data tools, plus narrowly scoped public health, OAuth discovery/callback, privacy, and signed webhook endpoints.

## Security check

- No credentials, API keys, access tokens, refresh tokens, identity values, or health payloads are logged or hardcoded.
- WHOOP tokens use AES-256-GCM encryption at rest; the encryption key and all OAuth credentials are environment variables.
- WHOOP OAuth state is random, hashed at rest, expires after ten minutes, and is single-use.
- WHOOP webhook signatures use timestamp-bounded HMAC-SHA256 validation and constant-time comparison.
- The MCP endpoint requires an Auth0 bearer token, the `whoop:read` scope, the configured audience, and optionally an exact personal Auth0 subject.
- Public inputs are bounded and validated with Zod; webhook payload size is limited.
- WHOOP token rotation uses optimistic concurrency control so parallel refreshes cannot overwrite the winning refresh token.
- PostgreSQL operations use the repository pattern; the supplied transaction helper explicitly uses Read Committed isolation.
- The production dependency advisory scan reported: `No known vulnerabilities found`.

## Test logs

```text
$ tsc --noEmit
Exit code: 0

$ vitest run
Test Files  6 passed (6)
Tests       12 passed (12)
Exit code: 0

$ tsc && node scripts/copy-widget.mjs
Exit code: 0

$ pnpm audit --prod
No known vulnerabilities found
Exit code: 0
```

The test suite covers coaching readiness/baselines, encrypted token round trips, WHOOP webhook signatures, OAuth URL and refresh-token rotation, OAuth callback persistence, and an in-memory MCP contract check for the dashboard and standard `search`/`fetch` tools.

## Validation level reached

- Level 0: static repo and security contract review completed.
- Level 1: strict TypeScript compilation, unit tests, production build, and dependency audit completed.
- Level 2 (partial): MCP server/tool negotiation was exercised through the SDK's in-memory transport.
- Not run: live PostgreSQL migration, real Auth0 login, real WHOOP OAuth/API calls, public HTTPS tunnel, or the ChatGPT Developer Mode host loop. Those require the user's external accounts, secrets, and deployed/tunneled URL.
- Render Blueprint preparation: `render.yaml` defines the Docker web service, private PostgreSQL database, generated token-encryption key, prompted OAuth secrets, health check, automatic deploys, and pre-deploy migration.
- Docker image build was not completed locally because Docker daemon/config access required an elevated approval that was unavailable in this session. The TypeScript production build used by the image passed.
