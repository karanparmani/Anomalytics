# AGENT INSTRUCTIONS & REPOSITORY CONSTRAINTS

This document enforces non-negotiable architectural patterns, security constraints, and compliance rules for all automated code generation, modifications, and refactoring within this repository. Adhere to these instructions strictly.

---

## 1. System & Architectural Boundaries
* **Architecture Style:** Clean Architecture / Layered Architecture. 
  * Core business logic must remain in `src/domain` and have zero dependencies on external frameworks or databases.
  * Infrastructure, database queries, and external APIs must be isolated within `src/infrastructure`.
* **State Management:** Functional and immutable. Do not mutate objects in-place; return fresh instances using deep copying or immutable patterns.
* **Database Operations:** 
  * All database interactions must use the repository pattern located in `src/infrastructure/repositories`.
  * **Isolation Level:** Read Committed. Handle potential race conditions via Optimistic Concurrency Control (OCC) using a `version` column. Direct locking (`SELECT FOR UPDATE`) is prohibited unless explicitly requested.

---

## 2. Security & Compliance Controls
* **Input Validation:**
  * Every public-facing API endpoint must validate incoming request payloads using the Zod schemas located in `src/shared/validation/`.
  * Sanitization must happen at the controller boundary before any data reaches the domain tier.
* **Data Privacy:**
  * **No PII Leakage:** Personally Identifiable Information (PII) such as emails, names, or phone numbers must never be logged. Wrap all sensitive variables in the custom `MaskedString` utility before passing to logger instances.
  * Secrets, API keys, or access tokens must **never** be hardcoded. Use `process.env` and ensure the corresponding key is declared in `.env.example`.
* **Authentication/Authorization Check:**
  * Every new controller method or route handler *must* explicitly chain the `requireAuth()` and `requireRole()` middleware. If a route is intentionally public, a code comment reading `// COMPLIANCE: Public Route` must precede it.

---

## 3. Code Quality & Testing Protocols
* **Type Safety:** 
  * TypeScript strict mode is active. The use of `any` or `eslint-disable-next-line` is strictly prohibited. Use explicit generic types or `unknown` with runtime type guards if data shape is uncertain.
* **Testing Requirements:**
  * For every new feature or bug fix, you **must** generate a corresponding unit test file in the adjacent `__tests__` directory.
  * Use Vitest/Jest for unit assertions. Mock all external infrastructure adapters using the custom test stubs provided in `tests/mocks/`.
  * Do not mark a task as complete unless the local test suite passes (`npm run test`).

---

## 4. Verification & Output Artifacts
Before modifying the file system or creating a Pull Request, you must generate an execution artifact outlining:
1. **Impact Assessment:** A 3-sentence summary of what files are changing and why.
2. **Security Check:** A explicit confirmation that no secrets are exposed, inputs are validated, and authentication is applied.
3. **Test Logs:** The stdout/stderr terminal capture showing that your generated tests passed locally.
