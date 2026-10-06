export const reportCategories = ['Waste', 'Pollution', 'Flooding', 'Drainage'] as const

export type ReportCategory = typeof reportCategories[number]

export const issueTypesByCategory: Record<ReportCategory, readonly string[]> = {
  Waste: ['Illegal dumping', 'Uncollected garbage', 'Overflowing trash bins', 'Improper waste segregation', 'Plastic waste', 'Hazardous waste', 'Other waste issue'],
  Pollution: ['Air pollution', 'Water pollution', 'Smoke', 'Foul odor', 'Chemical contamination', 'Noise pollution', 'Other pollution'],
  Flooding: ['Flooded road', 'Flooded residential area', 'Rising water', 'Drainage overflow', 'Flash flood', 'Other flooding issue'],
  Drainage: ['Clogged drainage', 'Damaged drainage', 'Blocked canal', 'Overflowing canal', 'Poor drainage', 'Other drainage issue'],
}

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === 'string' && reportCategories.includes(value as ReportCategory)
}

export async function classifyReportPhoto(file: File, accessToken?: string): Promise<ReportCategory | undefined> {
  if (!accessToken) throw new Error('Sign in to get a photo-based category suggestion.')

  const imageUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = imageUrl
    await image.decode()
    const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prepare the photo for analysis.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const imageData = canvas.toDataURL('image/jpeg', 0.78).split(',')[1]
    if (!imageData) throw new Error('The photo could not be prepared for analysis.')

    const response = await fetch('/api/classify-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ mimeType: 'image/jpeg', imageData }),
    })
    const result = await response.json() as { category?: unknown; error?: string }
    if (!response.ok) throw new Error(result.error || 'Photo analysis is temporarily unavailable.')
    return isReportCategory(result.category) ? result.category : undefined
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}