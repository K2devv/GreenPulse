import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.greenpulse.district5',
  appName: 'GreenPulse',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
