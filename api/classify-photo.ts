import { isReportCategory, reportCategories } from '../src/lib/classify-report-photo'

export const config = { runtime: 'edge' }

const maxImageDataLength = 2_000_000
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function jsonResponse(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return jsonResponse({ error: 'Photo analysis is not configured yet. Add GEMINI_API_KEY to the Vercel project settings.' }, 503)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!supabaseUrl || !supabaseKey || !accessToken) return jsonResponse({ error: 'Sign in before requesting photo analysis.' }, 401)

  try {
    const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseKey, authorization: `Bearer ${accessToken}` },
    })
    if (!authResponse.ok) return jsonResponse({ error: 'Your session expired. Sign in again to analyze this photo.' }, 401)

    const payload = await request.json() as { mimeType?: unknown; imageData?: unknown }
    if (typeof payload.imageData !== 'string' || payload.imageData.length > maxImageDataLength || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.imageData)) {
      return jsonResponse({ error: 'The prepared photo is invalid or too large.' }, 400)
    }
    if (typeof payload.mimeType !== 'string' || !allowedMimeTypes.has(payload.mimeType)) {
      return jsonResponse({ error: 'Use a JPEG, PNG, or WebP photo.' }, 400)
    }

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Classify this community environmental report photo into exactly one category: ${reportCategories.join(', ')}, or Unclear. Flooding means standing water covering normally dry land or a road; visible floodwater with people wading or vehicles driving through it is Flooding. Rain or a wet road alone is not enough. Waste means dumped or accumulated trash. Water pollution means visibly contaminated water. Air pollution means smoke or harmful emissions. Drainage means a blocked or damaged drain. If the image does not clearly show an issue, choose Unclear. Return only the required JSON category.` },
            { inlineData: { mimeType: payload.mimeType, data: payload.imageData } },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 40,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { category: { type: 'STRING', enum: [...reportCategories, 'Unclear'] } },
            required: ['category'],
          },
        },
      }),
    })

    if (!geminiResponse.ok) {
      console.error(`Gemini photo classification failed with HTTP ${geminiResponse.status}.`)
      if (geminiResponse.status === 401 || geminiResponse.status === 403) return jsonResponse({ error: 'Gemini rejected the API key. Check that the key is valid and Gemini API access is enabled.' }, 502)
      if (geminiResponse.status === 404) return jsonResponse({ error: 'Gemini 2.5 Flash Lite is unavailable for this API key. Enable the Gemini API for the key’s Google Cloud project or create a new AI Studio key.' }, 502)
      if (geminiResponse.status === 429) return jsonResponse({ error: 'Photo analysis is busy. Please try again shortly.' }, 502)
      return jsonResponse({ error: `Gemini rejected the photo request (HTTP ${geminiResponse.status}).` }, 502)
    }
    const result = await geminiResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text
    if (!responseText) return jsonResponse({ error: 'The image service returned no category. Please choose one manually.' }, 502)

    const classification = JSON.parse(responseText) as { category?: unknown }
    return jsonResponse({ category: isReportCategory(classification.category) ? classification.category : '' })
  } catch (error) {
    console.error('Photo classification endpoint error:', error instanceof Error ? error.message : 'unknown error')
    return jsonResponse({ error: 'Photo analysis is temporarily unavailable. Please try again or choose a category manually.' }, 502)
  }
}