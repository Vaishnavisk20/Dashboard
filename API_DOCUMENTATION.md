# API Documentation

Responses use:

```json
{ "success": true, "data": {}, "meta": {} }
```

Errors use:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

When `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` are set, all application routes require Basic Auth except `GET /api/health`.

## System

- `GET /api/health`

## Dashboard

- `GET /api/dashboard/kpis`
- `GET /api/dashboard/kpis/:key/projects`
- `GET /api/dashboard/status-distribution`
- `GET /api/dashboard/customer-tier-distribution`
- `GET /api/dashboard/effective-ic-distribution`
- `GET /api/dashboard/go-live-trend`
- `GET /api/dashboard/health-distribution`

Supported KPI keys: `total-projects`, `total-customers`, `active-projects`, `landed-projects`, `at-risk`, `on-hold`.

## Forecasts

- `GET /api/forecasts/date/:date`
- `GET /api/forecasts/month/:month`
- `GET /api/forecasts/range/:fromDate/:toDate`
- `GET /api/forecasts/date/:date/projects?category=delayed`
- `GET /api/forecasts/month/:month/projects?category=delayed`
- `GET /api/forecasts/range/:fromDate/:toDate/projects?category=delayed`

## Projects

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `DELETE /api/projects`
- `POST /api/projects/reset-seed`

## Capacity

- `GET /api/capacity`

## Data Quality

- `GET /api/data-quality/summary`

## Imports

- `POST /api/imports/projects/csv`
- `POST /api/imports/:importId/confirm`

Common filters: `search`, `status`, `customerTier`, `competency`, `effectiveIC`, `primaryIC`, `secondaryIC`, `icLead`, `station`, `integrationType`, `customer`, `healthStatus`, `page`, `pageSize`, `sortBy`, `sortDirection`.
