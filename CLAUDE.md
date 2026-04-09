# Kairous

学習科学に基づく複数手法を組み合わせた学習管理Webアプリ。

## Tech Stack

- Next.js 16 (App Router) / TypeScript 6 / Tailwind CSS 4
- Supabase (Auth / PostgreSQL / Edge Functions / Realtime)
- Recharts (charting)
- Vercel deploy
- Package manager: bun

## Directory Structure

```
src/
  app/              # App Router pages
    auth/           # /auth/login, /auth/signup
    (main)/         # BottomNav/Sidebar layout (route group, URL has no prefix)
      page.tsx      # Today (/)
      materials/    # /materials, /materials/[id]
      stats/        # /stats
      profile/      # /profile, /profile/notifications
    session/        # /session/[id], /session/[id]/review, /session/[id]/summary
    rest/           # /rest/[id] (wakeful rest timer)
  components/       # Shared UI components
  hooks/            # Shared custom hooks (useCountdownTimer etc.)
  lib/              # Utilities, Supabase client, types
tests/
  shared/           # DB helpers shared by Medium & Large tests
  small/            # Unit tests (vitest + jsdom)
  medium/           # Integration tests (vitest + Supabase local)
  large/            # E2E tests (Playwright + Supabase local)
supabase/
  migrations/       # SQL migrations
  functions/        # Edge Functions (FSRS, daily_logs upsert)
  seeds/            # Seed data (01_master.sql, 02_dev.sql)
```

## Commands

```bash
bun dev            # dev server
bun build          # production build
bun lint           # lint
bun typecheck      # type check
bun test:small     # Small tests (unit, mocked)
bun test:medium    # Medium tests (Supabase local)
bun test:large     # Large tests (Playwright E2E)
```

## Design Decisions

### Core Invariants

- **material_methods** is the core junction table. Never break the 1-material-to-many-methods structure.
- **FSRS computation** runs on Supabase Edge Functions only. No client-side calculation.
- **daily_logs** are upserted by Edge Function on session end. No real-time aggregation.
- **self_rating (1-4)** is mandatory for learning methods (SRS, interleaving, elaboration, pomodoro). NULL for wakeful_rest and free_study.
- **Wakeful Rest** timer is optional, launched from session summary. Independent session at `/rest/[id]`.
- **RLS** enabled on all tables. Edge Functions use service_role key to bypass.
- **sessions.status**: 'in_progress' | 'completed' | 'abandoned'.
- **Notification** uses client-side scheduling (Notification API + setTimeout). No Web Push in MVP. Schedules stored in `notification_schedules` table with master toggle in `profiles.notification_enabled`.

### Data Model Changes (from docs/kairous-design.md)

- `sessions.material_id`: nullable (for interleaving sessions)
- `sessions.self_rating`: added (INT 1-4, NULLable — NULL for wakeful_rest/free_study)
- `sessions.status`: clarified ('in_progress' | 'completed' | 'abandoned')
- `session_materials`: new table (interleaving multi-material support)
- `daily_logs.method_id`: added (enables per-method stats)

### Method Classification

- **Card-based** (SRS, Interleaving): use `card_reviews` table + FSRS
- **Card+meta-based** (Elaboration): use `card_reviews` table (no FSRS) + `sessions.meta` for elaboration text
- **Time-based** (Pomodoro, Free Study): use `sessions.meta` JSONB only
- **Consolidation** (Wakeful Rest): independent session with `meta.parent_session_id`
- **Custom (User-Defined)**: use `sessions.meta` JSONB for `{ actual_duration_sec, target_duration_sec }`. Timer-based with self-rating (1-4).

### When in Doubt

Follow learning science evidence from `docs/kairous-design.md`. Specifically:
- Spacing effect > massed practice
- Active recall > passive review
- Desirable difficulty > easy fluency
- If a UX choice conflicts with learning science, learning science wins.

## Specs

- [Screen Flow Design](docs/superpowers/specs/2026-04-05-screen-flow-design.md)
- [Stats Design](docs/superpowers/specs/2026-04-06-stats-design.md)
- [Wake-up Reminder Design](docs/superpowers/specs/2026-04-09-wake-up-reminder-design.md)

## Guides

- [Definition of Done](.claude/rules/definition-of-done.md)
- [PR Review Guide](docs/review-guide.md)
- [Issue Guide](docs/issue-guide.md)
