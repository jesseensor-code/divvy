/**
 * itemCategory.ts
 *
 * Coarse All/Beer/Wine/Drinks/Food grouping for the inventory filter lozenges.
 * No DB column — buckets the same fine-grained `type` keys used for emoji/toasts
 * (see itemEmoji.ts) into four broad groups.
 */

export type Category = 'beer' | 'wine' | 'drinks' | 'food'

export const CATEGORY_LABELS: Record<Category, string> = {
  beer: 'Beer', wine: 'Wine', drinks: 'Drinks', food: 'Food',
}

// Maps the fine-grained type/name keyword (from FUN_TOASTS/ITEM_EMOJIS) to a bucket.
const CATEGORY_BY_KEY: Record<string, Category> = {
  beer: 'beer', cider: 'beer',
  wine: 'wine',
  cocktail: 'drinks', whisky: 'drinks', gin: 'drinks', coffee: 'drinks', water: 'drinks',
  burger: 'food', steak: 'food', pizza: 'food', nachos: 'food', salad: 'food',
  chips: 'food', pasta: 'food', sushi: 'food', dessert: 'food', cake: 'food',
}

export function itemCategory(name: string, type?: string): Category {
  // Stored type takes precedence (exact match) — same precedence as funToast()
  // in TableTabView, so manually recategorising an item in Edit Menu sticks.
  if (type && CATEGORY_BY_KEY[type]) return CATEGORY_BY_KEY[type]
  const lower = name.toLowerCase()
  for (const [word, category] of Object.entries(CATEGORY_BY_KEY)) {
    if (lower.includes(word)) return category
  }
  return 'food'
}
