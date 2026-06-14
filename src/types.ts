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

// Sticky note colors — airy soft pastels, plus a pure-black option
export const NOTE_COLORS = {
  buttercream: '#fff9c4',
  blush: '#fff0f5',
  sky: '#eef5ff',
  mint: '#eefaf2',
  lilac: '#f5eeff',
  peach: '#fff5eb',
  bubblegum: '#ffe8f5',
  black: '#000000',
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

// Convert a light pastel note color into a dark-mode surface that KEEPS the hue.
// We blend the pastel heavily toward a dark base so the note reads as dark, but a
// faint tint of the original color survives — "dark mode with pastels".
export function toDarkPastel(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return '#26262e';
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  // Near-black base; keep ~16% of the pastel for a subtle colored tint.
  const base = { r: 0x1c, g: 0x1c, b: 0x20 };
  const keep = 0.16;
  const mix = (c: number, bse: number) => Math.round(bse * (1 - keep) + c * keep);
  const dr = mix(r, base.r);
  const dg = mix(g, base.g);
  const db = mix(b, base.b);
  return `#${((1 << 24) | (dr << 16) | (dg << 8) | db).toString(16).slice(1)}`;
}

// Whether a color is dark enough that it needs light text on top (used so the
// pure-black note — and dark-mode notes — stay readable regardless of theme).
export function isDarkColor(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const n = parseInt(c, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance (ITU-R BT.601)
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

// Slightly lift a dark-mode surface color (for titlebars / hover states).
export function lightenColor(hex: string, amount = 0.06): string {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return hex;
  const num = parseInt(clean, 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
