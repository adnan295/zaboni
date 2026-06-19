#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push-force
fuser -k 8080/tcp 2>/dev/null || true
