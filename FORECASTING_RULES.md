# Forecasting Rules

Forecasting is deterministic and implemented in `src/shared/projectLogic.js`.

## IC Fallback

1. Use primary IC when present.
2. Otherwise use Secondary IC when present.
3. Otherwise use `Unassigned`.

Blank strings, whitespace, `null`, and `undefined` are missing.

## Risk Score

- `On Hold`: +40
- Both IC and Secondary IC missing: +25
- Planned date missing: +25
- Go-live within 7 days and `Onboarding`: +35
- Go-live within 14 days and `Implementation`: +25
- Go-live within 7 days and `Testing & UAT`: +15
- Station missing: +10
- Integration type missing: +5
- Template missing: +5
- Blocking keyword in comment: +15
- `Customer Signed Off`: -20
- `Awaiting Go-Live`: -15

Scores are clamped from 0 to 100.

## Health

- `0-24`: On Track
- `25-49`: Watch
- `50-74`: At Risk
- `75-100`: Critical
