# Browser UI Preferences Implementation Plan

> **For agentic workers:** Implement this plan task by task in the current workspace. The project explicitly prohibits tests, typecheck, build, lint, and Git commands.

**Goal:** Persist theme and desktop sidebar state in browser cookies, removing their Supabase reads, writes, and Realtime refreshes.

**Architecture:** Keep the existing `petshop-theme` and `sidebar_state` cookies as the canonical state. Read them in the authenticated workspace layout for the first render; update them directly in client components. Remove the database preference table with a forward migration after replacing the signup trigger function that currently inserts into it.

**Tech Stack:** Next.js 16.4.2 App Router, React 19, Supabase Postgres migrations.

**Spec:** User-approved chat recommendation from 2026-10-21: browser-local cookies for theme/sidebar, preserving the theme across logout and avoiding database/API persistence.

## Global Constraints

- Do not run `git`, tests, typecheck, build, or lint.
- Use the installed Next.js 16 documentation for request cookies; `cookies()` is asynchronous and request-time.
- Preserve cookie names, defaults, and current lifetimes: theme one year; sidebar seven days.
- Do not edit historical Supabase migrations; add a forward migration.
- Browser cookies are the chosen source; preferences will not sync across browsers or devices.

## Review Focus

- Missing or invalid theme cookie falls back to `system`.
- Missing or invalid sidebar cookie starts expanded, matching the current default.
- Auth pages and the workspace use the same theme cookie before and after login/logout.
- Mobile sidebar visibility remains transient and is not persisted as the desktop collapsed state.
- New-user provisioning succeeds after the preference table is removed.

---

### Task 1: Make cookies the UI preference source

**Files:**
- Create: `src/lib/ui-preferences.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(workspace)/layout.tsx`
- Modify: `src/components/layout/workspace-shell.tsx`
- Modify: `src/components/ui/sidebar.tsx`
- Modify: `src/features/auth/components/auth-theme-toggle.tsx`
- Modify: `src/app/api/auth/logout/route.ts`

**Interfaces:**
- `Theme` is the union `"system" | "light" | "dark"`.
- `parseTheme(value)` returns a valid theme or `"system"`.
- `parseSidebarCollapsed(value)` returns `true` only for the stored value `"false"`; missing/invalid values default expanded.
- Shared constants preserve cookie names and max ages.

- [x] Add the shared cookie names, lifetimes, type, and parsers.
- [x] Use the theme cookie in the root bootstrap script and both theme controls; remove server-action feedback/rollback for local preference changes.
- [x] Read both cookies with `await cookies()` in the authenticated workspace layout and pass those values to the shell.
- [x] Keep the sidebar cookie write in the provider, with consistent `Path=/` and `SameSite=Lax` attributes.
- [x] Preserve the theme cookie when logout clears the Supabase auth session.

### Task 2: Remove database and Realtime preference paths

**Files:**
- Modify: `src/lib/auth/context.ts`
- Modify: `src/features/settings/actions.ts`
- Modify: `src/components/providers/realtime-provider.tsx`
- Modify: `src/types/database.generated.ts`

**Interfaces:**
- `getUserContext()` returns only user and store data; no preferences field.
- Settings actions retain store profile and logo operations only.

- [x] Remove the `user_preferences` query and returned preference values.
- [x] Remove `saveThemePreference` and `saveSidebarPreference` while retaining the remaining settings actions.
- [x] Remove the `user_preferences` Realtime subscription.
- [x] Remove the generated type entry for the dropped table.

### Task 3: Remove the database table safely and align documentation

**Files:**
- Create: `supabase/migrations/20261021001400_browser_ui_preferences.sql`
- Modify: `IMPLEMENTATION_PLAN.md`
- Modify: `docs/superpowers/plans/2026-10-21-feedback-mutacoes-ux-plan.md`
- Modify: `docs/superpowers/specs/2026-10-21-feedback-mutacoes-ux-design.md`

- [x] Replace `private.provision_store()` without the preference insert, then drop `public.user_preferences` in the forward migration.
- [x] Update active project notes to say theme/sidebar are browser preferences and do not produce mutation feedback.

### Task 4: Static verification

- [x] Search source, migrations, and active project notes for remaining runtime reads/writes/subscriptions to `user_preferences` or references to the removed server actions. Historical migrations retain the old schema for clean forward migration; runtime source has no remaining references.
- [x] Read the changed files and migration to check cookie defaults, signup provisioning order, and absence of prohibited operations.
- [x] Do not run tests or prohibited validation commands; report that limitation explicitly.
