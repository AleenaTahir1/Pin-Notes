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
}

// Sticky note colors - warm pastels
export const NOTE_COLORS = {
  yellow: '#fff59d',
  pink: '#f8bbd9',
  blue: '#90caf9',
  green: '#a5d6a7',
  purple: '#ce93d8',
  orange: '#ffcc80',
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

// Generate a slight random rotation for natural sticky note feel
export function getRandomRotation(): number {
  // Returns a value between -2 and 2 degrees
  return (Math.random() - 0.5) * 4;
}
