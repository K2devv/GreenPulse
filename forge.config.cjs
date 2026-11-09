const path = require('node:path')

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'GreenPulse',
    name: 'GreenPulse',
    icon: path.join(__dirname, 'desktop/icons/greenpulse'),
    extendInfo: {
      NSLocationWhenInUseUsageDescription: 'GreenPulse uses your location when you choose Current location to place a report or view nearby reports.',
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: { name: 'greenpulse_desktop', setupIcon: path.join(__dirname, 'desktop/icons/greenpulse.ico') },
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
