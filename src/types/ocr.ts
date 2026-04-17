/**
 * ocr.ts
 *
 * Types for the menu scanning / OCR feature (v2).
 * Used when a creator photographs a menu to pre-populate venue inventory.
 */

/**
 * Confidence level of an extracted item.
 *
 * 'high' → name and price parsed cleanly, no ambiguity
 * 'low'  → extraction was uncertain (e.g. blurry text, unusual layout,
 *           price couldn't be parsed, ambiguous item name)
 *
 * Low-confidence items are flagged visually in the review UI.
 */
export type OCRConfidence = 'high' | 'low'

/**
 * A single item extracted from a menu photo.
 *
 * `save` defaults to true — the user opt OUT of saving items they don't want,
 * rather than opting in. This keeps friction low for the common case.
 *
 * `price` can be null if the extraction couldn't parse a valid number
 * (e.g. "market price", partially obscured, etc). Null-price items
 * are always flagged regardless of confidence.
 */
export type OCRExtractedItem = {
  name: string
  price: number | null      // ZAR, null if unparseable
  confidence: OCRConfidence
  save: boolean             // default true
}

/**
 * The result of processing one or more menu photos.
 * `source_image_count` is surfaced in the UI so the user knows
 * how many photos were processed.
 */
export type OCRResult = {
  items: OCRExtractedItem[]
  source_image_count: number
}
