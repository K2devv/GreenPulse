/**
 * Android hardware back button: decides which open screen layer to close.
 * Ordered topmost first, matching how the layers stack on screen.
 */
export const BACK_LAYER_ORDER = [
  'palette',
  'auth',
  'profile',
  'responder',
  'team',
  'guest-tracking',
  'community-discussion',
  'follow-up',
  'report-form',
  'notifications',
  'staff-filters',
  'staff-detail',
  'map-sheet',
  'staff-mode',
] as const

export type BackLayer = (typeof BACK_LAYER_ORDER)[number]

/** Returns the topmost open layer, or undefined when the app is on its home view. */
export function topBackLayer(open: Partial<Record<BackLayer, boolean>>): BackLayer | undefined {
  return BACK_LAYER_ORDER.find((layer) => open[layer])
}

/**
 * Layers the Escape key closes on desktop, topmost first. The report form is left out so a stray
 * Escape cannot throw away a half-written report, and the command palette handles Escape itself.
 * Staff views and the map sheet are pages rather than overlays, so Escape leaves them alone.
 */
export const ESCAPE_LAYERS = ['auth', 'profile', 'responder', 'team', 'guest-tracking', 'community-discussion', 'follow-up', 'notifications'] as const satisfies readonly BackLayer[]

/** The overlay Escape should close, or undefined when Escape should do nothing. */
export function topEscapeLayer(open: Partial<Record<BackLayer, boolean>>): BackLayer | undefined {
  if (open.palette || open['report-form']) {
    // An overlay stacked above the report form (sign-in, for example) still closes; the form does not.
    const above = BACK_LAYER_ORDER.slice(0, BACK_LAYER_ORDER.indexOf('report-form')).find((layer) => open[layer])
    return above && (ESCAPE_LAYERS as readonly BackLayer[]).includes(above) ? above : undefined
  }
  return ESCAPE_LAYERS.find((layer) => open[layer])
}
