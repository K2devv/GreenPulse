const path = require('node:path')

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
      config: { name: 'GreenPulse', format: 'ULFO' },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
  ],
}
