# Persona

**Become more you.** A dark Expo SDK 57 / React Native app for Social, Guts, Smarts and Vitality challenges.

## Run

```sh
npm install
npm start
```

Press `w` for web or scan the terminal QR code with Expo Go. For physical iOS Expo Go, sign into `shfthdev` on the phone and Expo CLI. Native app builds use `eas.json`; EAS project initialization is still needed before the first cloud build.

## Firebase and leagues — no paid Cloud Functions

See **[Free backend setup](docs/FREE-BACKEND.md)** for the exact Firebase rules, GitHub Actions secret, scheduler activation, data schema and league policy.

```sh
npm run deploy:firebase
```

This deploys database rules only. Sign-in, profile updates, XP, levels, daily completions and ranked opt-in use rule-validated Realtime Database transactions. The GitHub job in `.github/workflows/leagues.yml` handles weekly promotions, Champions demotions, and five-calendar-month resets. The backend is not active merely because these files exist: publish the rules and activate the workflow with its secret.

Copy `.env.example` to `.env.local` when setting up another checkout. The five public Firebase configuration values must also be configured in EAS for cloud builds. Never put a service-account key in the app.

## Checks

```sh
npm test
npm run test:rules
npm run lint
npm run typecheck
npx expo-doctor
npm run export -- --platform all
```

Regenerate rules after changing fixed challenge rewards with `npm run rules:generate`, then run the emulator tests before publishing them. `shared/progression.js` supplies progression logic shared by the app, rule generator and scheduler.

## Expo builds

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform all
```

The Expo owner is `shfthdev`. iOS device/store distribution requires Apple signing and provisioning. Native bundle exports are not installable app builds or evidence of an on-device test.

## Identity

Black and white with blue accents, a vector masquerade mask, and an original generated glass-ribbon hero. See `assets/brand/README.md` for assets and the generation prompt.
