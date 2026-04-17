/**
 * itemEmoji.ts
 *
 * Keyword → emoji mapping for menu items.
 * Shared between TableTabView (inventory cards, toasts) and
 * anywhere that needs a sensible emoji for an item name.
 *
 * Usage:
 *   itemEmoji('Beer')         → '🍺'
 *   itemEmoji('Moose Hammer') → '🍽️'  (no match → default)
 */

export const ITEM_EMOJIS: Record<string, string> = {
  beer: '🍺', wine: '🍷', cocktail: '🍹', water: '💧', coffee: '☕',
  burger: '🍔', pizza: '🍕', steak: '🥩', salad: '🥗', nachos: '🧀',
  chips: '🍟', pasta: '🍝', sushi: '🍱', dessert: '🍰', cake: '🎂',
  whisky: '🥃', gin: '🍸', cider: '🍻',
}

export function itemEmoji(name: string): string {
  const lower = name.toLowerCase()
  for (const [word, emoji] of Object.entries(ITEM_EMOJIS)) {
    if (lower.includes(word)) return emoji
  }
  return '🍽️'
}
