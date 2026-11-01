// How each category looks: its name, icon and marker colour.
// Keep the keys in sync with server/src/lib/categories.ts.

import {
  Castle,
  Landmark,
  Mountain,
  ShoppingBag,
  Ticket,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryKey } from '../types';

export interface CategoryInfo {
  label: string;
  color: string; // marker colour on the map
  icon: LucideIcon;
}

export const CATEGORY_ORDER: CategoryKey[] = [
  'attraction',
  'nature',
  'historic',
  'food',
  'park',
  'entertainment',
  'shopping',
];

export const CATEGORY_INFO: Record<CategoryKey, CategoryInfo> = {
  attraction: { label: 'Tourist attractions', color: '#2f6f57', icon: Landmark },
  nature: { label: 'Nature & viewpoints', color: '#2f7f86', icon: Mountain },
  historic: { label: 'Historical places', color: '#a4663c', icon: Castle },
  food: { label: 'Restaurants & cafes', color: '#c2873a', icon: Utensils },
  park: { label: 'Parks', color: '#6a9a4a', icon: Trees },
  entertainment: { label: 'Entertainment', color: '#8a5a8a', icon: Ticket },
  shopping: { label: 'Shopping', color: '#4a6fa0', icon: ShoppingBag },
};
