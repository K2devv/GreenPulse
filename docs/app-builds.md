# GreenPulse app builds

GreenPulse keeps one hosted backend and three front ends: the browser website, a Windows desktop app, and an Android app. All three use the same Supabase project and the same Vercel API routes, so reports, accounts, and roles are shared. Each installed app keeps its own sign-in session.

| App | Technology | Where its code comes from | How it updates |
| --- | --- | --- | --- |
| Website | Vite build on Vercel | `src/` | Every Vercel deploy |
| Windows desktop | Electron shell (`desktop/`) | Loads the live website | Automatically with every website deploy |
| Android | Capacitor (`android/`) | Bundles the `src/` build | Install a new APK or Play Store release |

iOS and macOS projects exist in the repo (`ios/`, the DMG maker in `forge.config.cjs`) but are not built or tested right now.

## Windows desktop

The desktop app opens `https://greenpulse-district5.vercel.app` in its own window. Links to other sites open in the default browser, and only the location permission is granted. If the site cannot be reached, a local "can't connect" page appears and retries when the connection returns. Opening the app a second time focuses the existing window.

- **Run locally:** `npm run desktop:dev`. Set `GREENPULSE_DESKTOP_URL` to point it at another deployment, such as a preview URL.
- **Build the installer locally:** `npm run desktop:make` on Windows. Output goes to `out/make/`: `squirrel.windows/x64/GreenPulse-*-Setup.exe` and a zip.
- **Build in GitHub Actions:** run the **Desktop installers** workflow from the Actions tab, or push a `desktop-v*` tag. Download the `greenpulse-windows` artifact.
- **Code signing:** unsigned installers trigger a Windows SmartScreen warning. Buy a code-signing certificate and configure it in `forge.config.cjs` before public distribution.

Because the desktop app shows the live website, no rebuild is needed when the website changes. Rebuild only when `desktop/` or the app icon changes.

## Android

The Android app bundles the React build and talks directly to Supabase and to the Vercel API routes through `VITE_API_BASE_URL`. The API routes already allow the Android app's origin (`https://localhost`) in `server/app-cors.ts`.

Native behavior added for Android:

- The location button uses the native GPS permission prompt.
- Photo fields offer **Take photo** as well as the gallery.
- The hardware back button closes the open dialog, sheet, or staff detail first, then minimizes the app.
- Content stays clear of the status bar and gesture bar.
- The website's offline service worker is not registered inside the app, because the app already contains its files.

### Build in GitHub Actions (no Android Studio needed)

1. In the GitHub repo, open **Settings > Secrets and variables > Actions** and add these secrets with the same public values the website uses:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Run the **Android app** workflow from the Actions tab, or push a tag such as `android-v1.2.0`.
3. Download the `greenpulse-android-*` artifact. `app-debug.apk` installs on any phone with **Install unknown apps** allowed.

Each run sets the version code to the workflow run number, so every build installs over the previous one. A tag build uses the tag as the version name. Other runs use `1.0.<run number>`.

### Signed release builds for the Play Store

A Play Store upload needs a release keystore. Create it once and keep it safe, because losing it means you can no longer update the app.

```sh
keytool -genkeypair -v -keystore greenpulse-release.jks -alias greenpulse -keyalg RSA -keysize 2048 -validity 10000
```

Add these repository secrets:

- `ANDROID_KEYSTORE_BASE64`: the keystore file encoded as base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("greenpulse-release.jks"))`)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

With them set, the workflow also builds a signed `app-release.apk` and an `app-release.aab`. Upload the `.aab` in the Google Play Console. The Play listing, privacy form, and review are manual steps outside this repo.

### Build locally

1. Copy `.env.mobile.example` to `.env.mobile` and set the same public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` the website uses. Keep `VITE_APP_URL` and `VITE_API_BASE_URL` on the production web address. Never put server secrets in this file.
2. Run `npm run mobile:assets` when the app icon or splash graphics change.
3. Run `npm run mobile:sync` to check the settings, build the frontend, and copy it into `android/`.
4. Run `npm run mobile:android` to open Android Studio (with JDK 21 and the Android SDK installed), then build or run on a device.

The mobile build refuses placeholder settings, so it cannot accidentally produce a demo-only app.

Rebuild and reinstall the Android app whenever the frontend in `src/` changes. Database and API changes take effect without a rebuild.

## Accounts and email links

Email confirmation links and responder invitations open the website. After confirming in the browser, people sign in inside the app with the same account. Phone code sign-in works inside both apps. Keep the website address in the Supabase Auth allowed redirect URLs.

Native push notifications are not included yet. In-app notifications and notification emails work in all three front ends.
