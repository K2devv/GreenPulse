# GreenPulse desktop app

The Electron shell opens the production GreenPulse service in its own desktop window. It uses the same hosted Vercel APIs and Supabase database as the website. The browser website remains available at the same address.

## Develop

Run `npm run desktop:dev` to open the desktop shell. Set `GREENPULSE_DESKTOP_URL` to a different HTTPS deployment when needed.

## Package

Run `npm run desktop:make` on macOS to create the macOS app bundle and DMG (`out/make/dmg/<arch>/GreenPulse-<version>-<arch>.dmg`). Add `-- --arch=x64` for an Intel Mac build. Build the Windows installer on Windows or in a Windows CI runner. A DMG can't be built on Windows.

The `Desktop installers` GitHub workflow builds all three when you run it from the Actions tab or push a `desktop-v*` tag: `greenpulse-windows`, `greenpulse-macos-apple-silicon`, and `greenpulse-macos-intel`. To find out which Mac build you need, open Apple menu > About This Mac: a chip named "Apple M…" needs Apple silicon, and an "Intel" processor needs Intel.

These preview installers are unsigned; configure signing before broad distribution so the operating system can verify the publisher. The Mac app is signed ad hoc (see `forge.config.cjs`), so macOS opens it after one approval: open the DMG, drag GreenPulse to Applications, open it once, choose Done at the warning, then go to System Settings > Privacy & Security and choose Open Anyway.

The desktop shell loads the hosted app, so it needs an internet connection. Users sign in separately in the desktop app and in each browser, but their reports and accounts are shared through Supabase.
