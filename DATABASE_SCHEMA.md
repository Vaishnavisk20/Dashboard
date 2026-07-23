# Database Schema

The app can persist data in either:

- Local JSON files in `data/db` when Supabase environment variables are not set.
- Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

Run [supabase-schema.sql](/Users/vaishnavikrishnamurthy/Documents/Codex/2026-07-16/files-mentioned-by-the-user-you/supabase-schema.sql) in the Supabase SQL editor to create the tables.

The Supabase implementation stores common fields as normal readable columns and also keeps the full portfolio/import record in a `data` JSONB column. This gives you a clean Table Editor view while still preserving CSV extra fields.

Required environment variables:

```bash
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Optional table overrides:

```bash
export SUPABASE_PROJECTS_TABLE="dashboard_projects"
export SUPABASE_IMPORTS_TABLE="dashboard_imports"
```

## Project

- `id`
- `projectKey`
- `projectName`
- `customerName`
- `customerTier`
- `projectStatus`
- `competency`
- `primaryIC`
- `secondaryIC`
- `icLead`
- `stationName`
- `estimatedGoLiveDate`
- `originalGoLiveDate`
- `forecastedGoLiveDate` derived in API responses
- `forecastConfidence` derived in API responses
- `riskScore` derived in API responses
- `healthStatus` derived in API responses
- `integrationType`
- `templateName`
- `useCase`
- `comment`
- `isActive`
- `sourceFileName`
- `importedAt`
- `createdAt`
- `updatedAt`

`effectiveIC` is not stored permanently. It is derived with:

```text
IC -> Secondary IC -> Unassigned
```

## PostgreSQL/Prisma Migration Target

Recommended future Prisma models: `Project`, `ProjectAssignment`, `ProjectStatusHistory`, `ProjectDateHistory`, `ProjectAssignmentHistory`, `ProjectRisk`, `ProjectComment`, `ForecastRun`, `ProjectForecast`, `ImportJob`, `ImportRow`, `AuditLog`, `SavedView`, `CapacityConfiguration`, `ForecastConfiguration`.
