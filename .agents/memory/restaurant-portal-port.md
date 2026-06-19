---
name: Restaurant-portal port registration
description: Why artifact ports must be pre-registered in .replit [[ports]] for workflow health-checks to pass
---

## Rule
When `createArtifact` assigns a port (e.g. 21206), that port must appear in `.replit` [[ports]] or the workflow health-check will time out with "didn't open port XXXXX" even though Vite starts correctly.

**Why:** The Replit workflow runner monitors ports listed in `.replit` [[ports]]. If the port is not listed, the health-check probe never fires, the runner times out, and marks the workflow FAILED — even when `curl localhost:<port>` returns 200.

**How to apply:** If a workflow shows FAILED with "didn't open port N" but `curl localhost:N` succeeds, check whether port N is in `.replit` [[ports]]. If not, use `verifyAndReplaceArtifactToml` to change the artifact's `localPort` in `artifact.toml` to a port that IS already registered in `.replit`. You cannot edit `.replit` directly — the system blocks it.

**Fix applied for restaurant-portal:** Changed port from 21206 (unregistered) to 8082 (registered as externalPort 3001 in .replit).
