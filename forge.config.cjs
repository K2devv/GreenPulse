const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * Packaging renames Electron's bundle and rewrites its Info.plist, which breaks the
 * signature the official Electron build ships with. Apple silicon Macs then report a
 * downloaded copy as "damaged". Re-sign the whole app ad hoc (no Apple Developer ID)
 * so it opens after the usual "unidentified developer" approval.
 */
function adHocSignMacApp(outputPaths) {
  for (const outputPath of outputPaths) {
    const appPath = path.join(outputPath, 'GreenPulse.app')
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  }
}

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'GreenPulse',
    name: 'GreenPulse',
    // Without this the .exe keeps Electron's default "GitHub, Inc." company name,
    // and Windows files the Start menu shortcut under that folder.
    win32metadata: {
      CompanyName: 'GreenPulse District 5',
      ProductName: 'GreenPulse',
      FileDescription: 'GreenPulse',
    },
    icon: path.join(__dirname, 'desktop/icons/greenpulse'),
    // The desktop shell loads the live website, so it only needs desktop/ and package.json.
    // Everything else (src, android, web dependencies) is left out of the installer.
    ignore: (file) => Boolean(file) && !/^\/(desktop(\/|$)|package\.json$)/.test(file.replace(/\\/g, '/')),
    extendInfo: {
      NSLocationWhenInUseUsageDescription: 'GreenPulse uses your location when you choose Current location to place a report or view nearby reports.',
    },
  },
  rebuildConfig: {},
  hooks: {
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      if (platform === 'darwin') adHocSignMacApp(outputPaths)
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'greenpulse_desktop',
        // The Windows installer (Squirrel/NuGet) refuses to build without these.
        authors: 'GreenPulse District 5',
        description: 'GreenPulse environmental reporting and response coordination for District 5, Quezon City.',
        setupIcon: path.join(__dirname, 'desktop/icons/greenpulse.ico'),
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      // No `name` here, so the file is named GreenPulse-<version>-<arch>.dmg and the
      // Apple silicon and Intel downloads can't be mixed up. The volume is still "GreenPulse".
      config: {
        format: 'ULFO',
        icon: path.join(__dirname, 'desktop/icons/greenpulse.icns'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
  ],
}
