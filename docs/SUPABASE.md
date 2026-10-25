# Persona on Supabase

Project: `yqrxgdwdygvrhpwzardn`. The app now uses Supabase Auth and Postgres, replacing Firebase.

## Running the app

Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project's publishable key. Run `npm install` and `npm start -- --clear`.

Only the project URL and **publishable** key belong in `EXPO_PUBLIC_` variables. These are intentionally visible in a mobile/web bundle. Never add a database password, connection string, service-role key, or Supabase secret key. The app's security comes from server authorization, not from hiding a public key. Native sessions persist using AsyncStorage; web sessions use the SDK's browser storage. Treat unlocked devices and browser scripts as part of the session security boundary.

The database password shared during setup was not written into source, environment files, or the app. Rotate it in Supabase → Project Settings → Database. The app does not use that password and will continue working after rotation.

## Accounts

Create a Supabase account through the app. When email confirmation is enabled, confirm the email and then sign in in the app. Set the Auth Site URL to your deployed web app before production email signups. Configure SMTP for production email delivery and check your project's email rate limits.

**This is a fresh start on Supabase, as requested.** Firebase accounts and previous player data remain untouched in the old project. Create a new account in the app. Local guest progress stays on the device and is not trusted as ranked XP.

## Database tables

| Table | Content | Client access |
|---|---|---|
| `profiles` | Auth user ID, `data` containing name, XP, levels, league, completion receipts, ranked daily earnings, activity history | Read own row only |
| `challenges` | Six server-controlled challenge IDs, categories and rewards | Signed-in read |
| `competition` | Current weekly and five-calendar-month season boundaries | Signed-in read |
| `league_results` | Most recent weekly rank and promotion result | Read own row only |

Tables are protected by Row Level Security. Clients have **no direct insert, update or delete privileges**. `save_progress` accepts only an action, challenge ID, or display name; it derives the player ID from the verified Supabase session, uses the database clock, locks the player's row, awards fixed XP once daily, and computes stored levels. All private helpers use a fixed search path and explicit execute permissions. Leaderboard RPCs return only opted-in players' public names, IDs, weekly XP and level, capped at 100 rows.

`profiles.data` preserves the app's existing progression format; expand that JSON in Table Editor to see stats. No manual player seeds are needed. Profiles are created on first authenticated sync.

## Automatic leagues

Supabase Cron runs `persona_private.rollover()` every five minutes as the database owner. No GitHub secret, Firebase billing upgrade, Edge Function, or client timer is needed. Check Integrations → Cron → `persona-leagues` for run status.

- Bronze → Silver → Gold → Platinum → Diamond → Champions.
- After each seven-day UTC week, the top 15 players with positive weekly XP advance one league.
- Champions retain the top 15 active players; the others move to Diamond.
- Ties use descending user ID, matching the leaderboard.
- Every five calendar months all players return to Bronze, while lifetime XP and levels remain.
- Late runs process each elapsed week using saved daily earnings; season boundaries take precedence over promotion.
- A rollover lock coordinates with challenge saves. Device clock changes cannot award another day's XP.

Cron requires the Supabase project to be running. Free-plan quotas and project pausing still apply. While the app is open, profile updates use Realtime and rankings refresh every 30 seconds and after local actions.

## Development and verification

The complete schema is in `supabase/migrations/`. It was applied to the hosted project using the connected Supabase management tool. Use the Supabase CLI's current `--help` before linking or applying later migrations. Never put a database password in a command committed to this repo.

`supabase/tests/security.sql` contains transaction-based integration checks; execute against a development database or carefully in SQL Editor. It rolls back fixtures, checks owner isolation, denied direct writes, validated rewards, duplicate completion, and league rollover. Existing TypeScript tests cover local progression and the offline league reference model in `automation/leagues.cjs` (not a deployed scheduler).

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run export` before release. Run Supabase security advisors after schema changes.

Dependency audit note: the existing Expo 57 toolchain still reports transitive npm advisories (including node-forge, zod, uuid and decode-uri-component). No Supabase dependency advisories were reported. Review SDK-compatible upgrades separately; do not apply the suggested forced Expo downgrade.
