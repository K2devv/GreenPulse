# GreenPulse app builds

GreenPulse keeps one hosted backend and three front ends: the existing browser website, a desktop shell, and native Android/iOS shells. Reports and account data remain in the same Supabase project; each installed app keeps its own sign-in session.

## Desktop

The Electron desktop app opens `https://greenpulse-district5.vercel.app` in its own application window. Use `npm run desktop:dev` to launch it locally. Use `npm run desktop:make` on macOS to create a Mac app and DMG. Build the Windows installer on Windows or a Windows CI runner. Configure code signing before distributing release installers.

The desktop shell needs internet access and receives site updates from the deployed website. The normal browser site is unchanged.

## Android and iOS

1. Copy `.env.mobile.example` to `.env.mobile`.
2. Set the same public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` used by the website. Keep `VITE_APP_URL` and `VITE_API_BASE_URL` set to the production web origin.
3. Run `npm run mobile:assets` when app icons or splash graphics change.
4. Run `npm run mobile:sync` to validate the mobile environment, compile the bundled frontend, and sync it into the native projects.
5. Open Android Studio with `npm run mobile:android` or Xcode with `npm run mobile:ios` to build, sign, and distribute the app.

The bundled app makes direct Supabase requests and calls Vercel API routes using the configured API base URL. The Vercel routes allow only the GreenPulse website and the Capacitor localhost origins required by the installed apps. Update the Supabase Auth allowed redirect URLs to keep the website as the email confirmation and invitation destination; native deep links can be added for a later release.

The mobile build refuses placeholder environment values, so it cannot accidentally produce a demo-only app. `VITE_SUPABASE_ANON_KEY` is a public client key; do not put server-only secrets in `.env.mobile`.

Android builds require Android Studio and its SDK. iOS builds require macOS and Xcode, and App Store releases require Apple signing and review. Store accounts, signing credentials, and final store submissions are not part of this source setup.

The installed apps share reports and user accounts, but each device/app has its own login session. Maps and place search need an internet connection. Guest photo classification, invitations, and notification emails continue to use the configured Vercel endpoints.
