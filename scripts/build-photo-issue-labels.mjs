// Regenerates the label vectors in src/data/photo-issue-labels.json, which the report form uses to
// suggest a category and issue type from a photo, on the reporter's own device.
//
// The form runs only CLIP's image half in the browser (src/photo-issue.worker.ts). The text half is
// run here, once: each label's descriptions become one vector, saved next to them. A photo is
// matched against these vectors, so changing a description needs this script to be run again.
//
// Model: OpenAI CLIP ViT-B/32 (MIT license), ONNX build Xenova/clip-vit-base-patch32. The revision
// must match PHOTO_MODEL in src/lib/photo-issue-classifier.ts, or the vectors will not fit.
//
// Usage (transformers.js is only needed for this script, so it is not a project dependency):
//   npm install --no-save @huggingface/transformers@4.3.2
//   node scripts/build-photo-issue-labels.mjs [labels path]
import { readFile, writeFile } from 'node:fs/promises'

const labelsPath = process.argv[2] || new URL('../src/data/photo-issue-labels.json', import.meta.url)
const PRECISION = 5

let transformers
try {
  transformers = await import('@huggingface/transformers')
} catch {
  console.error('Install transformers.js first: npm install --no-save @huggingface/transformers@4.3.2')
  process.exit(1)
}
const { AutoTokenizer, CLIPTextModelWithProjection } = transformers

const data = JSON.parse(await readFile(labelsPath, 'utf8'))
const options = { revision: data.revision }
const tokenizer = await AutoTokenizer.from_pretrained(data.model, options)
const textModel = await CLIPTextModelWithProjection.from_pretrained(data.model, { ...options, dtype: 'fp32' })

const normalize = (vector) => {
  const length = Math.hypot(...vector)
  return vector.map((value) => value / length)
}

for (const label of data.labels) {
  // "a photo of …" is the wording CLIP was trained to match; averaging several descriptions
  // of the same label (prompt ensembling) makes the match steadier than any single one.
  const inputs = tokenizer(label.prompts.map((prompt) => `a photo of ${prompt}.`), { padding: true, truncation: true })
  const { text_embeds: embeds } = await textModel(inputs)
  const rows = embeds.tolist().map(normalize)
  const mean = rows[0].map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length)
  label.vector = normalize(mean).map((value) => Number(value.toFixed(PRECISION)))
}

await writeFile(labelsPath, `${JSON.stringify(data, (key, value) => key === 'vector' ? `[${value.join(',')}]` : value, 2).replace(/"\[([^\]]*)\]"/g, '[$1]')}\n`)
console.log(`Wrote ${data.labels.length} label vectors to ${labelsPath}`)
