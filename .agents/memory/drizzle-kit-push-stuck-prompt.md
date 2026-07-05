---
name: drizzle-kit push hangs on unrelated interactive prompt
description: When `drizzle-kit push` blocks on an interactive constraint-rename prompt unrelated to your change, use direct psql DDL instead.
---

`pnpm --filter @workspace/db run push` can get stuck on an interactive CLI prompt asking to rename/recreate an existing constraint (e.g. a `*_sort_orders_*` unique constraint) that has nothing to do with the schema change you're making. This prompt ignores `--force` and piped stdin answers, so the process just hangs.

**Why:** drizzle-kit's push flow re-diffs the *entire* schema, not just your new tables/columns, so pre-existing ambiguous constraint diffs surface every time regardless of what you're adding.

**How to apply:** if `drizzle-kit push` hangs waiting on an unrelated prompt, don't keep retrying it. Apply your specific schema addition directly via `psql "$DATABASE_URL" -c "..."` (CREATE TABLE / ALTER TABLE ADD COLUMN), then verify with `\d <table>`. Keep the Drizzle schema file as the source of truth for TypeScript types; the manual DDL just unblocks the dev DB.
