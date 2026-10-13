# Persona: free Firebase + GitHub league setup

Persona now uses Firebase Authentication and Realtime Database directly. Cloud Functions and a Firebase billing upgrade are not required. Firebase and GitHub free usage limits still apply.

## 1. Enable saves

Keep Email/Password enabled in Firebase Authentication. Publish the entire generated `database.rules.json` in Firebase Console → Realtime Database → Rules, or run:

```sh
npx firebase-tools@latest login
npm run deploy:firebase
```

This command deploys **only Realtime Database rules**. Existing signed-in users should reload the app and use Retry sync. No database seed is needed for profiles. Do not revert to `auth != null` write rules: the supplied rules validate challenge rewards and prevent clients from setting their own league.

Each private `/users/{uid}` record now stores `xp`, `levels`, `totalXp`, `level`, `name`, `joined`, `league`, `receipts`, `activityDays`, and `earnings`.

- `receipts/{challenge}` holds a count and the last UTC day awarded. Rules allow one increment per challenge per UTC day, tied to fixed XP amounts.
- `levels` and `level` are validated against XP (200 XP per level).
- `earnings/{UTC-day-number}` records ranked XP earned on that day. XP before ranked opt-in does not count.
- Existing profiles retain previous XP as immutable `baseXp`. A legacy profile with existing progress gets a one-day completion cooldown when migrated, preventing duplicate rewards from the old history format. New profiles have no cooldown.
- A transaction protects multi-device updates. A leaderboard sync failure does not roll back a successful profile save; the scheduler repairs public projections.

## 2. Activate the server-side league job

Repository: https://github.com/shfthof/Persona

The `.github/workflows/leagues.yml` workflow must be on the repository's default branch. It runs four times daily (00:23, 06:23, 12:23, 18:23 UTC) and can also run manually. GitHub may delay or drop scheduled runs. Daily XP history lets the next successful run settle missed weeks correctly. No phone needs to be open.

Create a dedicated Google Cloud service account in **persona-a6e00** with the **Firebase Realtime Database Admin** role (`roles/firebasedatabase.admin`). Create a JSON key for that account. In GitHub → shfthof/Persona → Settings → Secrets and variables → Actions, create a repository secret named:

```
FIREBASE_SERVICE_ACCOUNT
```

Set its value to the JSON key contents. Do not paste it in chat, commit it, or place it in an `EXPO_PUBLIC_` variable. The workflow uses this secret only to access the database with the Admin SDK. A user account login in the Firebase CLI is not a substitute for this scheduled-job credential.

Then open **Actions → Persona league scheduler → Run workflow**. A successful first run creates `/competition`, rebuilds `/leagueBoards`, and starts the season. `/leagueJob/lastRunAt` shows the last successful run. Inspect failed runs in GitHub Actions.

Public repositories get free standard hosted-runner usage; private repositories use your account's included minutes. This short job runs about 120 times monthly. Keep paid overage disabled if you want no charges. Public-repository schedules can be disabled after 60 days without repository activity; re-enable them in Actions if that happens.

## 3. League rules

Bronze → Silver → Gold → Platinum → Diamond → Champions.

- Everyone starts Bronze. Ranked participation is opt-in.
- One global leaderboard per league; the top **15 players with positive weekly XP** advance exactly one league after seven UTC days.
- Champions retain only the top 15 active players; others move to Diamond. Lower leagues have no demotion.
- Ties use Firebase's descending user-ID key order (the same order used by the app's reversed indexed query).
- Weekly XP is measured from the UTC start of each competition week, independent of when the scheduler executes.
- After **five calendar months**, everyone returns to Bronze and a new season starts. Lifetime XP, personal levels, names and completion receipts are preserved.
- The final short week ends at the season boundary; a season reset takes precedence over promotions then.
- The app shows up to 100 players from the selected league; the scheduler ranks every participant.
- `/competition` controls week/season boundaries. Only the Admin job can write it or change leagues. `/leagueResults/{uid}` records the most recent weekly result (private to that user).

## Validation and limits

```sh
npm test
npm run test:rules  # requires Java 21+ for Firebase's local emulator
npm run lint
npm run typecheck
```

The scheduler uses a root transaction so profile writes, league assignments and public boards cannot race with a rollover. This is designed for a small free-tier app; large user populations need a partitioned backend. Realtime Database's free quotas are not unlimited. Daily history is retained to support delayed rollovers; add archival when needed.

Challenges remain self-reported. Rules prevent arbitrary XP, duplicate daily rewards and league changes, but cannot verify real-world activity.
