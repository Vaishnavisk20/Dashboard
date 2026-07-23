# CSV Import Guide

Run:

```bash
npm run import:projects -- "data/imports/projects-filtered-20260715-1505.csv" --full
```

The importer:

- Validates required Project and Customer columns.
- Normalizes supported header aliases.
- Parses ISO and slash-style dates.
- Creates a stable key from normalized Project and Customer.
- Updates existing projects when the key already exists.
- Creates new records when the key is new.
- Marks missing projects inactive only in full snapshot mode.
- Never hard-deletes project records.

The Imports page supports preview and confirmation using the same backend importer.
