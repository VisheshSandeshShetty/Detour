// The seven place categories Detour shows. The keys are stored in the database and sent to the
// frontend, so keep them in sync with client/src/lib/categories.ts.

export const CATEGORIES = [
  'attraction',
  'nature',
  'historic',
  'food',
  'park',
  'entertainment',
  'shopping',
] as const;

export type CategoryKey = (typeof CATEGORIES)[number];

// Surprise Me needs to know how long you would spend at a place. These are rough, honest
// ESTIMATES per category (the app labels them "estimated visit time"), not data from any source.
export const VISIT_MINUTES: Record<CategoryKey, number> = {
  attraction: 45,
  nature: 30,
  historic: 40,
  food: 45,
  park: 40,
  entertainment: 90,
  shopping: 45,
};

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  attraction: 'Tourist attractions',
  nature: 'Nature & viewpoints',
  historic: 'Historical places',
  food: 'Restaurants & cafes',
  park: 'Parks',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
};
