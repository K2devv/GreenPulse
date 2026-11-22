import { t } from './i18n'
export const MAX_REPORT_PHOTOS = 5
export const REPORT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Why these photos cannot be attached, or undefined when they can. `attached` is how many the report already has. */
export function reportPhotoProblem(incoming: readonly { type: string; size: number }[], attached: number, guest: boolean): string | undefined {
  if (attached + incoming.length > MAX_REPORT_PHOTOS) return t('Attach up to {count} report photos.', { count: MAX_REPORT_PHOTOS })
  const maxBytes = guest ? 2_500_000 : 5 * 1024 * 1024
  for (const file of incoming) {
    if (!(REPORT_PHOTO_TYPES as readonly string[]).includes(file.type)) return t('Choose JPEG, PNG, or WebP images for the report photos.')
    if (file.size > maxBytes) return guest ? t('Guest report photos must be 2.5 MB or smaller each.') : 'Each report photo must be 5 MB or smaller.'
  }
  return undefined
}

export type PreparedReportPhoto = {
  file: File
  preview: string
  dataUrl: string
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(t('The photo could not be prepared.')))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(t('The photo could not be prepared.')))
    reader.readAsDataURL(blob)
  })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(t('This browser could not compress the photo.'))), 'image/jpeg', quality)
  })
}

export async function prepareReportPhoto(file: File, guest: boolean): Promise<PreparedReportPhoto> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()

    const maxDimension = guest ? 1200 : 1600
    const byteTarget = guest ? 430_000 : 1_300_000
    let scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    let quality = 0.84
    let blob: Blob | undefined
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('This browser cannot prepare the photo for upload.'))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      blob = await canvasBlob(canvas, quality)
      if (blob.size <= byteTarget) break
      if (quality > 0.52) quality -= 0.08
      else scale *= 0.82
    }

    if (!blob) throw new Error(t('The photo could not be prepared.'))
    if (guest && blob.size > 480_000) throw new Error(t('This photo is too detailed to send as a guest report. Choose a smaller image.'))
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'report-photo'
    const prepared = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
    const preview = await readAsDataUrl(blob)
    return { file: prepared, preview, dataUrl: preview }
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
