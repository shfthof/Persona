# Persona

**Become a little more you.** An Expo / React Native app for daily Social, Guts, Smarts, and Vitality challenges, with a black-and-white interface, blue accents, and masquerade-mask branding.

## Run

```sh
npm install
cp .env.example .env.local
# Set your Supabase publishable key in .env.local
npm start
```

Supabase Auth handles accounts; Postgres stores XP, levels, completion history, and leagues. Server functions validate rewards and Supabase Cron handles weekly promotions and five-month seasons. The project database has been provisioned; no manual data seeds are required.

Read [Supabase setup and security](docs/SUPABASE.md) for account confirmation, existing Firebase migration limitations, database tables, scheduling, and credential handling.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run export
```

Database integration checks: `supabase/tests/security.sql`.

## Mobile builds

The app uses Expo SDK 57, Expo Router and EAS configuration in `eas.json`. Use the configured Expo owner `shfthdev`. Consult the SDK-matching EAS documentation before building/signing or submitting releases. Native builds are separate from the verified JavaScript bundle export.
