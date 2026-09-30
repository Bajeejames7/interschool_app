# Ambassadors Football — Interschool App

One app for every school Ambassadors Football works with: intramurals (Rafiki Classical, Daniels School) and clubs (ICC Imara, Rosslyn Academy), with room to add more when a new partnership starts.

For each school, coaches can:

- **Home**: see the next session and confirm they're coming.
- **Session** (Tuesday by default): answer the availability poll and see who is coming, the coach role assignments and the session schedule.
- **Calendar**: every session day in the month, plus a board for coach updates.
- **Tally**: live team points (Wisdom, Justice, Fortitude, Temperance) by coaching category.

The TTG tab from the Base44 version is gone.

## Who can do what

| | User (every new sign-up) | Coordinator (of one school) | Admin | Creator |
|---|---|---|---|---|
| Sign in with email + password (no Google) | ✓ | ✓ | ✓ | ✓ |
| Answer the availability poll, post updates, give tally points | ✓ | ✓ | ✓ | ✓ |
| Edit coach roles, the session schedule and the school's setup; reset points | | own school | all | all |
| Add a new school, intramural or club; choose coordinators | | | ✓ | ✓ |
| Make someone an Admin | | | ✓ | ✓ |
| Take admin away from someone, change another admin's account | | | | ✓ |
| **Creator Control** page | | | (sees it as "People") | ✓ |

The creator is whoever signs up with the email in `CREATOR_EMAIL`. That role lives in the settings, not the database, so nobody can take it away.

## Why every phone now shows the same thing

The server keeps the only copy of the data. Each open screen checks for changes every few seconds, and again as soon as the phone comes back to the app or back online. Every change is saved on the server first.

- If two admins edit the same session at once, the second one is told and shown the latest version. Nobody's change is silently lost.
- If a tally tap is re-sent after a timeout on a slow connection, it is still counted only once.

## Run it on your computer

You need Node.js 20+ and a Postgres database. Docker works: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=interschool postgres:16`.

```bash
cp .env.example .env        # then fill it in
npm install
npm run dev                 # web app on http://localhost:5173, API on :3000
```

(`npm run dev` reads the variables from your shell. On Windows PowerShell, set them first with `$env:DATABASE_URL="..."` etc., or use `node --env-file=.env`.)

Other commands:

- `npm test` runs the API tests against a real database. Set `TEST_DATABASE_URL`, and note that the tests wipe that database.
- `npm run typecheck`
- `npm run build`, then `npm start`: the production build, where one server serves both the app and the API.

## Put it online (free)

1. Create a free Postgres database (for example on [Neon](https://neon.tech)) and copy its connection string.
2. On [Render](https://render.com), choose **New → Blueprint** and pick this repository. `render.yaml` sets everything up.
3. Fill in `DATABASE_URL` and `CREATOR_EMAIL` when Render asks. `TOKEN_SECRET` is generated for you.
4. Open the Render link and sign up with the creator email. You'll see the shield icon that opens **Creator Control**.

Free Render servers sleep when idle, so the first visit after a quiet spell takes about a minute.

## How the code is laid out

```
server/            Express API (TypeScript)
  migrations.ts    database tables, and the four schools it starts with
  auth.ts          sign-in tokens and who-may-do-what
  routes/          one file per area: auth, users, programs, sessions, tally
web/src/           React app
  lib/queries.ts   how screens stay in sync
  pages/           one file per screen
tests/api.test.ts  what the API must do, written as tests
```

## Android app

`android/` is a small native app (a WebView) that opens the live web app, like the Base44 APK did. Everything else lives in the web app, so changes there reach phones without a new APK. The address is set by `APP_URL` in `android/app/build.gradle`.

Build it with JDK 17 and the Android SDK:

```bash
cd android
./gradlew assembleRelease    # → app/build/outputs/apk/release/app-release.apk
```

It is signed with the debug key so it installs straight from WhatsApp. For the Play Store, make a real upload key.
