import { loadEnv } from 'vite'

const env = loadEnv('mobile', process.cwd(), '')
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_APP_URL', 'VITE_API_BASE_URL']
const missing = required.filter((key) => {
  const value = env[key]?.trim()
  return !value || /your-project|your-public|your-anon|example\.com/i.test(value)
})

if (missing.length) {
  console.error(`Mobile build needs real public app settings in .env.mobile: ${missing.join(', ')}`)
  process.exit(1)
}

for (const key of ['VITE_SUPABASE_URL', 'VITE_APP_URL', 'VITE_API_BASE_URL']) {
  try {
    if (new URL(env[key]).protocol !== 'https:') throw new Error('HTTPS is required.')
  } catch {
    console.error(`${key} must be a valid HTTPS URL in .env.mobile.`)
    process.exit(1)
  }
}
