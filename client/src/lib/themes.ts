// The kinds of place Surprise Me can be filtered by. Keep the keys in sync with
// server/src/lib/themes.ts (the server does the real filtering).

import {
  Castle,
  Church,
  Eye,
  Landmark,
  Mountain,
  Palmtree,
  Droplets,
  Sparkles,
  Trees,
  Library,
  Tent,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';

export type ThemeKey =
  | 'landmark'
  | 'beach'
  | 'waterfall'
  | 'viewpoint'
  | 'hill'
  | 'park'
  | 'historic'
  | 'temple'
  | 'museum'
  | 'adventure'
  | 'cave'
  | 'other';

export interface ThemeInfo {
  key: ThemeKey;
  label: string;
  icon: LucideIcon;
}

export const THEMES: ThemeInfo[] = [
  { key: 'landmark', label: 'Landmarks and monuments', icon: Landmark },
  { key: 'beach', label: 'Beaches', icon: Palmtree },
  { key: 'waterfall', label: 'Waterfalls', icon: Droplets },
  { key: 'viewpoint', label: 'Viewpoints', icon: Eye },
  { key: 'hill', label: 'Hills and peaks', icon: Mountain },
  { key: 'park', label: 'Parks and nature', icon: Trees },
  { key: 'historic', label: 'Historical places', icon: Castle },
  { key: 'temple', label: 'Temples and religious sites', icon: Church },
  { key: 'museum', label: 'Museums', icon: Library },
  { key: 'adventure', label: 'Adventure and activities', icon: Tent },
  { key: 'cave', label: 'Caves', icon: CircleDot },
  { key: 'other', label: 'Other attractions', icon: Sparkles },
];

export const ALL_THEME_KEYS = THEMES.map((theme) => theme.key);

export const themeLabel = (key: ThemeKey) => THEMES.find((theme) => theme.key === key)?.label ?? key;
