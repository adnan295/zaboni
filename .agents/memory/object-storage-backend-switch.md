---
name: Object storage backend switch (GCS vs local disk)
description: How to safely add an alternate storage backend to a service that already has one default backend running in production/dev.
---

When a shared service (e.g. `ObjectStorageService`) needs to support an
alternate backend (local disk on a self-hosted VPS) alongside its existing
one (Replit Object Storage / GCS sidecar), gate the new backend behind an
explicit env flag that **defaults to the existing behavior**.

**Why:** the same codebase keeps running in the original environment (Replit
dev) even while a deployment target (VPS) needs different behavior. If the
new backend became the default, or shared state format changed unconditionally,
the original environment would break silently.

**How to apply:**
- Add one env var (e.g. `STORAGE_MODE`) that is opt-in for the new backend;
  every code path defaults to old behavior when unset.
- Model the two backends as a discriminated union return type (e.g.
  `{kind:"gcs",...} | {kind:"local",...}`) so callers don't need to branch —
  only the service internals do.
- Backends that lack a native feature the other has (e.g. local disk has no
  presigned-URL upload or object metadata) need an explicit substitute:
  local disk used a short-lived in-memory upload-token endpoint plus a
  sidecar `.meta.json` file for content-type/ACL.
- Client assumptions can silently differ per platform — e.g. browser
  `fetch()` accepts relative URLs (resolves against page origin), but
  React Native / Expo `fetch()` does not; server must return an absolute
  URL when the response is consumed by a mobile client.
- Verify the default path is unaffected by exercising the flagged path in
  isolation (env var override in a throwaway script) rather than flipping
  the flag in the actually-running dev environment.
