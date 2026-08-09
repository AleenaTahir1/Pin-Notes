import type { Language, MessageKey } from './store/i18n';

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
  // Remembered font for this note (one of NOTE_FONTS[].value). Empty/undefined = default.
  font?: string;
  // Remembered text size in px. 0/undefined = default (DEFAULT_FONT_SIZE).
  font_size?: number;
}

// Does this note contain markdown worth a preview toggle? Plain notes return false,
// so the eye/preview button only shows on markdown or template-rendered notes.
export function hasMarkdown(content: string): boolean {
  if (!content) return false;
  // Block markers at the start of a line: # heading, - / * bullet, > quote
  if (/^\s{0,3}(#{1,6}\s|[-*]\s|>\s)/m.test(content)) return true;
  // Task checkbox: - [ ] / - [x] (space after the dash optional)
  if (/[-*]\s*\[[ xX]\]/.test(content)) return true;
  // Inline: **bold**, ~~strike~~, `code`, ==highlight==
  if (/\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|==[^\n]+==/.test(content)) return true;
  return false;
}

// Per-note text size — two buttons (A− / A+) step through these presets, clamped.
export const DEFAULT_FONT_SIZE = 18;
export const FONT_SIZE_PRESETS = [13, 15, 18, 22, 26, 32] as const;
export const MIN_FONT_SIZE = FONT_SIZE_PRESETS[0];
export const MAX_FONT_SIZE = FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];

// Step to the previous/next size preset (dir = -1 or +1), clamped at the ends.
export function stepFontSize(px: number, dir: -1 | 1): number {
  if (dir === 1) {
    return FONT_SIZE_PRESETS.find((p) => p > px) ?? MAX_FONT_SIZE;
  }
  return [...FONT_SIZE_PRESETS].reverse().find((p) => p < px) ?? MIN_FONT_SIZE;
}

// Sticky note colors — airy soft pastels. These same hues tint the surface in dark
// mode (see toDarkPastel), so there's no separate "black" swatch: use the dark-mode
// toggle for a dark note instead.
export const NOTE_COLORS = {
  buttercream: '#fff9c4',
  blush: '#fff0f5',
  sky: '#eef5ff',
  mint: '#eefaf2',
  lilac: '#f5eeff',
  peach: '#fff5eb',
  bubblegum: '#ffe8f5',
  seafoam: '#e1f7f2',
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
  { nameKey: 'font.handwriting', value: "'Caveat', 'Patrick Hand', cursive" },
  { nameKey: 'font.clean', value: "'Segoe UI', system-ui, sans-serif" },
  { nameKey: 'font.mono', value: "'Cascadia Code', 'Fira Code', monospace" },
] as const;

// Note templates — quick starting points. `{{date}}` / `{{time}}` are filled in at
// creation time. Users can add their own by dropping .md files in a `Templates` folder
// inside their connected Obsidian vault (see get_vault_templates).
export interface NoteTemplate {
  name: string;
  content: string;
  builtin?: boolean;
}

// Built-in templates are translated: `nameKey` is the i18n key, `content` holds
// one localized starting document per language.
export interface BuiltinTemplate {
  nameKey: MessageKey;
  content: Record<Language, string>;
  builtin: true;
}

export const NOTE_TEMPLATES: BuiltinTemplate[] = [
  {
    nameKey: 'template.todo',
    builtin: true,
    content: {
      zh: '# 待办事项\n\n- [ ] \n- [ ] \n- [ ] ',
      en: '# To-do\n\n- [ ] \n- [ ] \n- [ ] ',
    },
  },
  {
    nameKey: 'template.daily',
    builtin: true,
    content: {
      zh: '# {{date}}\n\n## 今日重点\n\n## 记录\n\n## 已完成\n',
      en: '# {{date}}\n\n## Focus\n\n## Notes\n\n## Done\n',
    },
  },
  {
    nameKey: 'template.meeting',
    builtin: true,
    content: {
      zh: '# 会议 — {{date}}\n\n参会人员：\n\n## 议程\n- \n\n## 记录\n\n## 待办事项\n- [ ] ',
      en: '# Meeting — {{date}}\n\nAttendees: \n\n## Agenda\n- \n\n## Notes\n\n## Action items\n- [ ] ',
    },
  },
  {
    nameKey: 'template.project',
    builtin: true,
    content: {
      zh: '# 项目：\n\n## 目标\n\n## 里程碑\n- [ ] \n- [ ] \n\n## 记录\n',
      en: '# Project: \n\n## Goal\n\n## Milestones\n- [ ] \n- [ ] \n\n## Notes\n',
    },
  },
  {
    nameKey: 'template.habit',
    builtin: true,
    content: {
      zh: '# 习惯 — {{date}}\n\n- [ ] 喝水\n- [ ] 运动\n- [ ] 阅读\n- [ ] 睡眠 8 小时',
      en: '# Habits — {{date}}\n\n- [ ] Water\n- [ ] Exercise\n- [ ] Read\n- [ ] Sleep 8h',
    },
  },
  {
    nameKey: 'template.book',
    builtin: true,
    content: {
      zh: '# 书名：\n\n作者：\n\n## 核心观点\n- \n\n## 摘录\n> \n\n## 收获\n- ',
      en: '# Book: \n\nAuthor: \n\n## Key ideas\n- \n\n## Quotes\n> \n\n## Takeaways\n- ',
    },
  },
  {
    nameKey: 'template.prosCons',
    builtin: true,
    content: {
      zh: '# 决策：\n\n## 优点\n- \n\n## 缺点\n- ',
      en: '# Decision: \n\n## Pros\n- \n\n## Cons\n- ',
    },
  },
  {
    nameKey: 'template.grocery',
    builtin: true,
    content: {
      zh: '# 购物清单\n\n- [ ] \n- [ ] \n- [ ] ',
      en: '# Groceries\n\n- [ ] \n- [ ] \n- [ ] ',
    },
  },
  {
    nameKey: 'template.quick',
    builtin: true,
    content: {
      zh: '- \n- \n- ',
      en: '- \n- \n- ',
    },
  },
];

// Fill {{date}} / {{time}} placeholders with the current local date/time.
export function applyTemplatePlaceholders(content: string): string {
  const now = new Date();
  return content
    .replace(/\{\{date\}\}/g, now.toLocaleDateString())
    .replace(/\{\{time\}\}/g, now.toLocaleTimeString());
}

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
  // Dark anthracite base; keep ~22% of the pastel so the chosen hue is clearly
  // visible while the surface still reads as dark — a buttercream note becomes warm
  // dark grey, a sky note a cold blue-ish anthracite ("dark mode with pastels").
  const base = { r: 0x1c, g: 0x1c, b: 0x20 };
  const keep = 0.22;
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
