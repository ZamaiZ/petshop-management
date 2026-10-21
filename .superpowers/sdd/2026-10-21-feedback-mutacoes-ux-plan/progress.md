# SDD ledger — plan: docs/superpowers/plans/2026-10-21-feedback-mutacoes-ux-plan.md

Ruling: execute in the existing workspace without a worktree or commits — repository instructions prohibit `git` — cost if wrong: implementation is not isolated and has no commit rollback point until the user reviews it.

## Scope

- Approved plan: `docs/superpowers/plans/2026-10-21-feedback-mutacoes-ux-plan.md`
- Spec: `docs/superpowers/specs/2026-10-21-feedback-mutacoes-ux-design.md`
- User forbids `git`, test, typecheck, build, and lint; no automated tests will be added or run.

## Progress

- Phase 0: implemented — appointment/service error mapping, correlation references, safe structured logs, and local mutation feedback. The exact remote failure remains unconfirmed until reproduced.
- Phase 1: implemented — root toast provider, delayed local busy region, and realtime refresh coordination that preserves queued events when an action fails or does not refresh the active route.
- Phase 2: implemented — inventory and finance writes use scoped pending feedback and action-specific toasts; partial inventory-count creation reports the committed state and revalidates the route.
- Phase 3: implemented — sales, deliveries, and appointment writes use scoped pending feedback and action-specific toasts.
- Phase 4: implemented — customer, supplier, and service writes use scoped pending feedback and action-specific toasts.
- Phase 5: implemented — settings, shell preferences, logout, and auth flows use pending feedback and toasts.
- Phase 6: static audit complete; visual/runtime acceptance pending.

## Verification

- Static audit compared exported Server Actions, mutation call sites, feedback wrappers, route revalidation paths, remaining `router.refresh()` calls, and obsolete callback props.
- The audit found and fixed missing `/configuracoes` revalidation after logo upload/removal.
- Realtime echoes are coalesced with successful active-route revalidation; events queued across failed or non-revalidating actions trigger one deferred refresh.
- No `test`, `typecheck`, `build`, or `lint` command was run, per repository instructions. No tests were added.
- The app was not exercised against the user's failing remote database, so no claim is made that the specific appointment/service RPC or policy failure has been observed and confirmed.
- Final review: self-review (no subagent tool).
- Review findings fixed: the logger now retains PostgREST codes such as `PGRST202`; logo mutations revalidate their current screen; a partially committed inventory count is reported as a warning instead of a failed start.

