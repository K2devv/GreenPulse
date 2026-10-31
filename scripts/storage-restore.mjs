import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const backupRoot = path.resolve(process.argv[2] || '')
const targetBucket = process.env.REPORT_PHOTO_BUCKET || 'report-photos'
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!process.argv[2]) throw new Error('Usage: node scripts/storage-restore.mjs <backup-folder>')
if (!supabaseUrl || !serviceKey) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')

const manifest = JSON.parse(await readFile(path.join(backupRoot, 'manifest.json'), 'utf8'))
if (manifest.format !== 'greenpulse-storage-backup-v1' || !Array.isArray(manifest.objects)) throw new Error('Unsupported or invalid backup manifest.')
if (manifest.bucket !== targetBucket) throw new Error(`Backup bucket is ${manifest.bucket}; target bucket is ${targetBucket}. Set REPORT_PHOTO_BUCKET to confirm the intended target.`)

const entries = []
for (const item of manifest.objects) {
  if (typeof item.path !== 'string' || item.path.startsWith('/') || item.path.includes('\\') || item.path.includes(':') || path.isAbsolute(item.path)
    || item.path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('The backup contains an unsafe object path.')
  if (!Number.isInteger(item.bytes) || item.bytes < 0 || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
    || typeof item.contentType !== 'string' || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(item.contentType)) throw new Error('The backup manifest contains invalid file metadata.')
  const filePath = path.join(backupRoot, 'objects', ...item.path.split('/'))
  const bytes = await readFile(filePath)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (bytes.length !== item.bytes || digest !== item.sha256) throw new Error(`Backup integrity check failed for ${item.path}.`)
  entries.push({ ...item, bytes })
}

console.log(`Verified ${entries.length} files. Restore target: ${supabaseUrl} / ${targetBucket}`)
if (process.env.CONFIRM_STORAGE_RESTORE !== `RESTORE:${targetBucket}`) {
  console.log(`No objects uploaded. To restore, set CONFIRM_STORAGE_RESTORE=RESTORE:${targetBucket} and rerun.`)
  process.exit(0)
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
for (const item of entries) {
  const { error } = await supabase.storage.from(targetBucket).upload(item.path, item.bytes, { contentType: item.contentType, upsert: false })
  if (error) throw new Error(`Could not restore ${item.path}: ${error.message}`)
}
console.log(`Restored ${entries.length} objects to ${targetBucket}. Existing object paths are never overwritten.`)
