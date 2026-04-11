# Kairous

学習科学に基づく複数手法を組み合わせた学習管理Webアプリ。

## Tech Stack

- Next.js 16 (App Router) / TypeScript 6 / Tailwind CSS 4
- Supabase (Auth / PostgreSQL / Edge Functions / Realtime)
- Recharts (charting) / Vercel deploy / bun

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
- [Streak Counter Design](docs/superpowers/specs/2026-04-11-streak-counter-design.md)

## Guides

- [Definition of Done](.claude/rules/definition-of-done.md)
- [PR Review Guide](docs/review-guide.md)
- [Issue Guide](docs/issue-guide.md)
