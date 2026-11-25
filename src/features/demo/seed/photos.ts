/**
 * Photos the demo seed posts carry. They live with the seed, not in lib/post-media, which the
 * reader's feed imports: sharing a module put the seed data, and through it the account
 * client, into a chunk every reader downloaded (2026-11-22).
 *
 * Exports: HANOI_MORNING_GIF, DEMO_STATUS_PHOTOS
 * Depends on: none (leaf module)
 */

export const HANOI_MORNING_GIF =
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjlvNjVwMWYxeHQ2aGloY2N4czJqeDZvY2Rwd21ubWF5eHhhbjhhOSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tZZTCbdO5cRUVUULFL/giphy.gif";

export const DEMO_STATUS_PHOTOS = {
  hanoiMorning: HANOI_MORNING_GIF,
  conversation:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80",
  vietnameseRhythm:
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1400&q=80",
  smallIdea:
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80",
  denseInfo:
    "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1400&q=80",
  dinnerTable:
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80",
} as const;
