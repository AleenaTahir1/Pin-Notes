export interface Note {
  id: string;
  content: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: number;
  updated_at: number;
  is_visible: boolean;
  is_pinned: boolean;
}

// Sticky note colors — airy soft pastels
export const NOTE_COLORS = {
  buttercream: '#fff9c4',
  blush: '#fff0f5',
  sky: '#eef5ff',
  mint: '#eefaf2',
  lilac: '#f5eeff',
  peach: '#fff5eb',
  bubblegum: '#ffe8f5',
  seafoam: '#e8fff5',
} as const;

export type NoteColor = keyof typeof NOTE_COLORS;

// Highlighter colors - soft and cute
export const HIGHLIGHTER_COLORS = {
  yellow: 'rgba(255, 245, 157, 0.6)',
  pink: 'rgba(248, 187, 208, 0.5)',
  green: 'rgba(165, 214, 167, 0.5)',
  blue: 'rgba(144, 202, 249, 0.5)',
  purple: 'rgba(206, 147, 216, 0.5)',
} as const;

export type HighlighterColor = keyof typeof HIGHLIGHTER_COLORS;

// Available fonts for notes
export const NOTE_FONTS = [
  { name: 'Handwriting', value: "'Caveat', 'Patrick Hand', cursive" },
  { name: 'Clean', value: "'Segoe UI', system-ui, sans-serif" },
  { name: 'Mono', value: "'Cascadia Code', 'Fira Code', monospace" },
] as const;

// Generate a slight random rotation for natural sticky note feel
export function getRandomRotation(): number {
  // Returns a value between -2 and 2 degrees
  return (Math.random() - 0.5) * 4;
}
