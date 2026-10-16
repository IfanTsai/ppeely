// Emojis that stickers can be tagged with.
// WhatsApp's sticker search groups stickers by emoji into six categories (love, happy, sad, angry, greeting, celebration), and only the emojis in the list it published
// map to a category, so the picker offers only emojis from that list, arranged in the same categories.
// Source of the list: https://github.com/WhatsApp/stickers/wiki/Tag-your-stickers-with-Emojis
// Some emojis belong to two categories (e.g. the broken heart is in both "love" and "sad"), and are listed in both.
export const EMOJI_GROUP_IDS = ['love', 'happy', 'sad', 'angry', 'greet', 'celebrate'] as const;

export type EmojiGroupId = (typeof EMOJI_GROUP_IDS)[number];

export interface EmojiGroup {
  id: EmojiGroupId;
  emojis: string[];
}

const CODE_POINTS: Record<EmojiGroupId, string> = {
  love: `
    2764-fe0f 1f60d 1f618 1f495 1f63b 1f491 1f469-200d-2764-fe0f-200d-1f469 1f468-200d-2764-fe0f-200d-1f468
    1f48f 1f469-200d-2764-fe0f-200d-1f48b-200d-1f469 1f468-200d-2764-fe0f-200d-1f48b-200d-1f468 1f9e1 1f49b 1f49a 1f499 1f49c
    1f5a4 1f494 2763-fe0f 1f49e 1f493 1f497 1f496 1f498
    1f49d 1f49f 2665-fe0f 1f48c 1f48b 1f469-200d-2764-fe0f-200d-1f468 1f469-200d-2764-fe0f-200d-1f48b-200d-1f468 1f46c
    1f46d 1f46b 1f970 1f61a 1f619 1f444 1f339 1f63d`,
  happy: `
    1f600 1f603 1f604 1f601 1f606 1f605 1f602 1f923
    1f642 1f61b 1f61d 1f61c 1f92a 1f917 1f63a 1f638
    1f639 263a-fe0f 1f60c 1f609 1f60a`,
  sad: `
    2639-fe0f 1f623 1f616 1f62b 1f629 1f622 1f62d 1f61e
    1f614 1f61f 1f615 1f624 1f620 1f625 1f630 1f628
    1f63f 1f63e 1f613 1f64d-200d-2642-fe0f 1f64d-200d-2640-fe0f 1f494 1f641 1f97a
    1f915 2614 26c8-fe0f 1f329-fe0f 1f327-fe0f`,
  angry: `
    1f62f 1f626 1f627 1f62e 1f632 1f640 1f631 1f92f
    1f633 2757 2755 1f92c 1f621 1f620 1f644 1f47f
    1f63e 1f624 1f4a2 1f47a 1f5ef-fe0f 1f612 1f975`,
  greet: `1f44b`,
  celebrate: `
    1f38a 1f389 1f381 1f388 1f46f-200d-2642-fe0f 1f46f 1f46f-200d-2640-fe0f 1f483
    1f57a 1f525 2b50 2728 1f4ab 1f387 1f386 1f37b
    1f942 1f37e 1f382 1f370`,
};

export const EMOJI_GROUPS: EmojiGroup[] = EMOJI_GROUP_IDS.map((id) => ({
  id,
  emojis: CODE_POINTS[id]
    .trim()
    .split(/\s+/)
    .map((sequence) => String.fromCodePoint(...sequence.split('-').map((code) => parseInt(code, 16)))),
}));
