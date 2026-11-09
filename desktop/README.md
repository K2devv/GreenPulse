# GreenPulse desktop app

The Electron shell opens the production GreenPulse service in its own desktop window. It uses the same hosted Vercel APIs and Supabase database as the website. The browser website remains available at the same address.

## Develop

Run `npm run desktop:dev` to open the desktop shell. Set `GREENPULSE_DESKTOP_URL` to a different HTTPS deployment when needed.

## Package

Run `npm run desktop:make` on macOS to create the macOS app bundle and DMG. Build the Windows installer on Windows or in a Windows CI runner. The optional `Desktop installers` GitHub workflow creates downloadable macOS and Windows artifacts when manually run or when a `desktop-v*` tag is pushed. These preview installers are unsigned; configure signing before broad distribution so the operating system can verify the publisher.

The desktop shell loads the hosted app, so it needs an internet connection. Users sign in separately in the desktop app and in each browser, but their reports and accounts are shared through Supabase.
