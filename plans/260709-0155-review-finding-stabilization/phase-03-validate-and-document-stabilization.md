---
phase: 3
title: "Validate and document stabilization"
status: completed
priority: P1
dependencies: [1, 2]
---

# Phase 3: Validate and document stabilization

## Overview

Prove that the stabilization work is real, not cosmetic, by locking it with regression checks, full repo verification, and one last docs/code drift sweep.

## Requirements

- Functional:
  - Fixed paths must have enough regression coverage to catch the same failures again.
  - `npm run lint`, `npm run build`, `npm test`, and `npm run verify` must all pass.
  - Final docs must describe the same route/env behavior the code now implements.
- Non-functional:
  - Keep validation focused on touched behavior first, then broaden.
  - Report failures faithfully; do not weaken tests or skip verification noise silently.

## Architecture

Validation should follow the same order as the repo rules:
1. narrow checks for the changed behavior,
2. broader shared-contract checks,
3. static drift sweep for stale strings/imports.

This phase is also where the plan confirms the recommended Phase 2 design decision: if no current consumer needs restored billing columns, keep the schema lean and document that subscription detail remains in snapshot storage under the free-first scope.

## Related Code Files

- Modify as needed: `test/lifecycle.test.ts`
- Modify as needed: any new focused test files created in Phases 1-2
- Modify: docs touched in Phase 1 if final verification exposes drift
- Inspect: `package.json`
- Inspect: `src/sapo/*`, `src/storefront/*`, `src/ops/*`

## Implementation Steps

1. Add or finish regression tests for the exact bugs fixed in Phases 1-2.
2. Run the narrowest useful checks first (targeted tests for auth routes, webhook URL generation, subscription persistence, storefront config sync).
3. Run the broad repo checks:
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run verify`
4. Run grep/static sweeps for stale route strings, stale webhook paths, and stale Haravan test imports.
5. Re-read the touched docs and confirm they still match the final code, not the intermediate draft.
6. Record any remaining unknowns as follow-up work instead of quietly expanding this stabilization scope.

## Success Criteria

- [x] Regression coverage exists for the fixed review findings.
- [x] `npm run lint` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [x] `npm run verify` passes.
- [x] Final docs and sample env values match the fixed controller/runtime contracts.
- [x] Any remaining billing follow-up is documented explicitly instead of hidden in this stabilization patch.

## Risk Assessment

- A green build with weak tests would recreate the current problem under a different shape. Prefer a smaller but current test suite over preserving stale, broad legacy tests.
- Docs drift can come back during late edits. End this phase with a final code-vs-doc pass, not just command output.