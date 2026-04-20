#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
fuser -k 8080/tcp 2>/dev/null || true
