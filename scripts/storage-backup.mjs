import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const bucket = process.env.REPORT_PHOTO_BUCKET || 'report-photos'
const output = path.resolve(process.argv[2] || '')
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!process.argv[2]) throw new Error('Usage: node scripts/storage-backup.mjs <new-backup-folder>')
if (!supabaseUrl || !serviceKey) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')

const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const objects = []

async function listRecursively(prefix = '') {
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Could not list ${prefix || bucket}: ${error.message}`)
    for (const item of data ?? []) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name
      if (!item.id && !item.metadata) await listRecursively(objectPath)
      else objects.push(objectPath)
    }
    if ((data ?? []).length < 100) return
    offset += 100
  }
}

await mkdir(output, { recursive: false })
await listRecursively()
const manifest = { format: 'greenpulse-storage-backup-v1', bucket, createdAt: new Date().toISOString(), objects: [] }

for (const objectPath of objects) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath)
  if (error || !data) throw new Error(`Could not download ${objectPath}: ${error?.message ?? 'No file returned'}`)
  const bytes = Buffer.from(await data.arrayBuffer())
  const destination = path.join(output, 'objects', ...objectPath.split('/'))
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, bytes, { flag: 'wx' })
  manifest.objects.push({ path: objectPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), contentType: data.type || 'application/octet-stream' })
}

await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
console.log(`Backed up ${manifest.objects.length} objects from ${bucket} to ${output}`)
