import markSrc from '@/assets/tradeflow-mark.png'

/**
 * Product brand configuration.
 * Change the name, tagline or category here — every screen reads from this file.
 */
export const BRAND = {
  name: 'TradeFlow',
  /** Two-tone wordmark: first part in ink, second in slate (matches the logo artwork). */
  wordmark: ['Trade', 'Flow'] as const,
  /** Symbol image (src/assets); full logo + favicons are in public/brand/. */
  markSrc,
  category: 'B2B Distribution & Sales Management Platform',
  tagline: 'From Customer Request to Fulfillment.',
  supportEmail: 'support@tradeflow.example',
  /** Shown wherever the app needs to be explicit that it is a prototype. */
  demoNotice: 'Access is restricted to authorised users. Activity is logged.',
} as const
