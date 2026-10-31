import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')

const bucket = `greenpulse-recovery-test-${Date.now()}`
const objectPath = 'recovery-probe.txt'
const testRoot = await mkdtemp(path.join(os.tmpdir(), 'greenpulse-storage-recovery-'))
const backupRoot = path.join(testRoot, 'backup')
const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
let bucketCreated = false
const fixture = new TextEncoder().encode(`GreenPulse storage recovery check ${new Date().toISOString()}`)

function run(script, backupPath, env = {}) {
  const result = spawnSync(process.execPath, [script, backupPath], {
    cwd: process.cwd(),
    env: { ...process.env, REPORT_PHOTO_BUCKET: bucket, ...env },
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`${script} failed: ${result.stderr || result.stdout}`)
  process.stdout.write(result.stdout)
}

try {
  const { error: createError } = await supabase.storage.createBucket(bucket, { public: false })
  if (createError) throw new Error(`Could not create the temporary recovery bucket: ${createError.message}`)
  bucketCreated = true

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, fixture, { contentType: 'text/plain', upsert: false })
  if (uploadError) throw new Error(`Could not upload the recovery fixture: ${uploadError.message}`)

  run('scripts/storage-backup.mjs', backupRoot)
  const { error: removeError } = await supabase.storage.from(bucket).remove([objectPath])
  if (removeError) throw new Error(`Could not remove the temporary recovery fixture: ${removeError.message}`)
  run('scripts/storage-restore.mjs', backupRoot, { CONFIRM_STORAGE_RESTORE: `RESTORE:${bucket}` })

  const { data, error: downloadError } = await supabase.storage.from(bucket).download(objectPath)
  if (downloadError || !data) throw new Error(`Could not download the restored fixture: ${downloadError?.message ?? 'No object returned'}`)
  const restored = new Uint8Array(await data.arrayBuffer())
  if (restored.length !== fixture.length || restored.some((byte, index) => byte !== fixture[index])) throw new Error('The restored photo-storage bytes did not match the uploaded fixture.')
  console.log('Storage backup and restore recovery check passed.')
} finally {
  if (bucketCreated) {
    await supabase.storage.from(bucket).remove([objectPath])
    const { error } = await supabase.storage.deleteBucket(bucket)
    if (error) console.error(`Remove temporary bucket ${bucket} manually: ${error.message}`)
  }
  const tempRoot = path.resolve(os.tmpdir())
  const relative = path.relative(tempRoot, path.resolve(testRoot))
  if (relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) {
    await rm(testRoot, { recursive: true, force: true })
  } else {
    console.error('Temporary recovery files were retained because their path did not pass the safety check.')
  }
}
