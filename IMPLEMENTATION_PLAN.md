# Implementation Plan

## Repository Findings

- The shared workspace did not contain an existing full-stack application.
- The supplied CSV was available at `/Users/vaishnavikrishnamurthy/Downloads/projects-filtered-20260715-1505.csv` and has 83 project rows.
- This implementation creates a self-contained Project Delivery Dashboard in the current workspace rather than a separate demo beside an existing app.

## Technology Approach

- Backend: Node.js HTTP API with modular services and JSON-backed storage for this local workspace.
- Frontend: API-driven single-page dashboard using semantic HTML, CSS, and JavaScript.
- Tests: Node's built-in test runner for reusable business rules and API consistency.
- Data: CSV is used only for seeding/import; dashboard values are computed from stored project records through backend APIs.

## Build Phases

1. Create project skeleton and local data directories.
2. Implement CSV normalization, stable project keys, and Effective IC derivation.
3. Implement deterministic forecasting, risk, health, and capacity services.
4. Implement API routes for KPIs, projects, forecasts, capacity, data quality, and imports.
5. Build an API-driven enterprise dashboard frontend with filters, clickable KPI drawers, tables, forecast date controls, and import flow.
6. Add documentation and focused tests for business-critical rules.
7. Run seed, unit/API tests, and build validation.

## Assumptions

- PostgreSQL/Prisma could not be wired without an existing project or dependency installation context, so the local implementation uses JSON persistence while preserving API and service boundaries that can be swapped to PostgreSQL.
- Authentication did not exist in the workspace, so role-ready UI/API metadata is documented but not enforced by a real identity provider.
- The local CSV path is copied into `data/imports/` for repeatable development import.
