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
