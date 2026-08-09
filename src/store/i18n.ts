import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'pinnotes-language';

const zhMessages = {
  'app.name': '便笺',
  'app.noteTitle': '便笺',
  'app.listTitle': '便笺',

  'language.switchToEn': '切换到英文',
  'language.switchToZh': '切换到中文',
  'language.button': '中',

  'notesList.title': '便笺',
  'notesList.connectObsidian': '连接到 Obsidian',
  'notesList.disconnectObsidian': '断开 Obsidian 连接',
  'notesList.chooseVault': '选择 Obsidian 仓库文件夹（便笺将双向同步）',
  'notesList.syncOne': '已同步 1 条便笺，现在可双向编辑',
  'notesList.syncOther': '已同步 {count} 条便笺，现在可双向编辑',
  'notesList.connectFailed': '无法连接仓库，请查看控制台',
  'notesList.disconnected': '已断开 Obsidian 连接（文件已保留）',
  'notesList.justNow': '刚刚',
  'notesList.minutesAgo': '{count} 分钟前',
  'notesList.hoursAgo': '{count} 小时前',
  'notesList.daysAgo': '{count} 天前',
  'notesList.emptyNote': '空白便笺',
  'notesList.switchToLight': '切换到浅色模式',
  'notesList.switchToDark': '切换到深色模式',
  'notesList.newNoteTitle': '新建便笺 / 从模板创建',
  'notesList.blankNote': '空白便笺',
  'notesList.templates': '模板',
  'notesList.fromVault': '来自你的仓库',
  'notesList.vaultHintStart': '将 ',
  'notesList.vaultHintMiddle': ' 文件放入仓库中的 ',
  'notesList.vaultHintEnd': ' 文件夹，即可在此使用自定义模板。',
  'notesList.connectVaultCta': '连接 Obsidian 仓库以使用自定义模板 →',
  'notesList.minimize': '最小化',
  'notesList.close': '关闭',
  'notesList.searchPlaceholder': '搜索便笺……',
  'notesList.clearSearch': '清除搜索',
  'notesList.noNotes': '还没有便笺',
  'notesList.noNotesHint': '点击 + 创建第一条便笺',
  'notesList.noMatches': '没有匹配项',
  'notesList.noMatchesHint': '请尝试其他搜索词',
  'notesList.unpin': '取消置顶',
  'notesList.pin': '置顶便笺',
  'notesList.pinned': '已置顶',
  'notesList.delete': '删除',

  'note.notFound': '未找到便笺',
  'note.allNotes': '所有便笺',
  'note.changeColor': '更改颜色',
  'note.font': '字体：{name}',
  'note.smallerText': '缩小文字',
  'note.largerText': '放大文字',
  'note.switchToEdit': '切换到编辑模式',
  'note.previewRendered': '预览渲染后的便笺',
  'note.edit': '编辑',
  'note.preview': '预览',
  'note.minimize': '最小化',
  'note.closeEsc': '关闭（Esc）',
  'note.resize': '拖动以调整大小',

  'font.handwriting': '手写',
  'font.clean': '简洁',
  'font.mono': '等宽',

  'color.buttercream': '奶油黄',
  'color.blush': '腮红粉',
  'color.sky': '天空蓝',
  'color.mint': '薄荷绿',
  'color.lilac': '丁香紫',
  'color.peach': '蜜桃色',
  'color.bubblegum': '泡泡糖粉',
  'color.seafoam': '海沫绿',

  'highlight.yellow': '黄色',
  'highlight.pink': '粉色',
  'highlight.green': '绿色',
  'highlight.blue': '蓝色',
  'highlight.purple': '紫色',

  'editor.placeholder': '写点什么……',
  'editor.highlightTitle': '{color}高亮',
  'editor.removeHighlight': '移除高亮',

  'delete.title': '清空此便笺？',
  'delete.message': '此便笺中的所有内容都会被删除，并恢复为空白便笺。',
  'delete.keep': '保留内容',
  'delete.clear': '清空',

  'update.available': '发现可用更新',
  'update.ready': '版本 {version} 已准备就绪，包含最新功能和修复。',
  'update.skip': '跳过',
  'update.now': '立即更新',
  'update.downloading': '正在更新……',
  'update.keepOpen': '{progress}% · 请保持应用打开',
  'update.restarting': '正在重启……',
  'update.reopening': '便笺正在以新版本重新打开。',

  'template.todo': '待办清单',
  'template.daily': '每日便笺',
  'template.meeting': '会议记录',
  'template.project': '项目计划',
  'template.habit': '习惯打卡',
  'template.book': '读书笔记',
  'template.prosCons': '利弊分析',
  'template.grocery': '购物清单',
  'template.quick': '快速列表',
} as const;

export type MessageKey = keyof typeof zhMessages;

const enMessages: Record<MessageKey, string> = {
  'app.name': 'Pin Notes',
  'app.noteTitle': 'Pin Note',
  'app.listTitle': 'Pin Notes',

  'language.switchToEn': 'Switch to English',
  'language.switchToZh': 'Switch to Chinese',
  'language.button': 'EN',

  'notesList.title': 'Notes',
  'notesList.connectObsidian': 'Connect to Obsidian',
  'notesList.disconnectObsidian': 'Disconnect from Obsidian',
  'notesList.chooseVault': 'Choose your Obsidian vault folder (notes sync both ways)',
  'notesList.syncOne': 'Synced 1 note — editing now works both ways',
  'notesList.syncOther': 'Synced {count} notes — editing now works both ways',
  'notesList.connectFailed': 'Could not connect vault — see console',
  'notesList.disconnected': 'Disconnected from Obsidian (files kept)',
  'notesList.justNow': 'Just now',
  'notesList.minutesAgo': '{count}m ago',
  'notesList.hoursAgo': '{count}h ago',
  'notesList.daysAgo': '{count}d ago',
  'notesList.emptyNote': 'Empty note',
  'notesList.switchToLight': 'Switch to light mode',
  'notesList.switchToDark': 'Switch to dark mode',
  'notesList.newNoteTitle': 'New note / from template',
  'notesList.blankNote': 'Blank note',
  'notesList.templates': 'Templates',
  'notesList.fromVault': 'From your vault',
  'notesList.vaultHintStart': 'Drop ',
  'notesList.vaultHintMiddle': ' files into a ',
  'notesList.vaultHintEnd': ' folder in your vault to use your own here.',
  'notesList.connectVaultCta': 'Connect an Obsidian vault to use your own templates →',
  'notesList.minimize': 'Minimize',
  'notesList.close': 'Close',
  'notesList.searchPlaceholder': 'Search notes...',
  'notesList.clearSearch': 'Clear search',
  'notesList.noNotes': 'No notes yet',
  'notesList.noNotesHint': 'Click + to create your first note',
  'notesList.noMatches': 'No matches',
  'notesList.noMatchesHint': 'Try a different search term',
  'notesList.unpin': 'Unpin note',
  'notesList.pin': 'Pin note',
  'notesList.pinned': 'Pinned',
  'notesList.delete': 'Delete',

  'note.notFound': 'Note not found',
  'note.allNotes': 'All notes',
  'note.changeColor': 'Change color',
  'note.font': 'Font: {name}',
  'note.smallerText': 'Smaller text',
  'note.largerText': 'Larger text',
  'note.switchToEdit': 'Switch to editing',
  'note.previewRendered': 'Preview the rendered note',
  'note.edit': 'Edit',
  'note.preview': 'Preview',
  'note.minimize': 'Minimize',
  'note.closeEsc': 'Close (Esc)',
  'note.resize': 'Drag to resize',

  'font.handwriting': 'Handwriting',
  'font.clean': 'Clean',
  'font.mono': 'Mono',

  'color.buttercream': 'Buttercream',
  'color.blush': 'Blush',
  'color.sky': 'Sky',
  'color.mint': 'Mint',
  'color.lilac': 'Lilac',
  'color.peach': 'Peach',
  'color.bubblegum': 'Bubblegum',
  'color.seafoam': 'Seafoam',

  'highlight.yellow': 'Yellow',
  'highlight.pink': 'Pink',
  'highlight.green': 'Green',
  'highlight.blue': 'Blue',
  'highlight.purple': 'Purple',

  'editor.placeholder': 'Write something...',
  'editor.highlightTitle': '{color} highlight',
  'editor.removeHighlight': 'Remove highlight',

  'delete.title': 'Clear this note?',
  'delete.message': "Everything on this note will be erased and you'll get a fresh page.",
  'delete.keep': 'Keep it',
  'delete.clear': 'Clear',

  'update.available': 'Update available',
  'update.ready': 'Version {version} is ready — with the latest features and fixes.',
  'update.skip': 'Skip',
  'update.now': 'Update now',
  'update.downloading': 'Updating…',
  'update.keepOpen': '{progress}% — please keep the app open',
  'update.restarting': 'Restarting…',
  'update.reopening': 'Pin Notes is reopening on the new version.',

  'template.todo': 'To-do list',
  'template.daily': 'Daily note',
  'template.meeting': 'Meeting notes',
  'template.project': 'Project plan',
  'template.habit': 'Habit tracker',
  'template.book': 'Book notes',
  'template.prosCons': 'Pros & cons',
  'template.grocery': 'Grocery list',
  'template.quick': 'Quick bullets',
};

const dictionaries: Record<Language, Record<MessageKey, string>> = {
  zh: zhMessages,
  en: enMessages,
};

function readStored(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

let current: Language = readStored();
const listeners = new Set<() => void>();

function applyToDocument(lang: Language) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

applyToDocument(current);

// Sync live across all open windows: a change in one window fires a `storage`
// event in the others (all webviews share the same localStorage origin).
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  const next = readStored();
  if (next === current) return;
  current = next;
  applyToDocument(current);
  listeners.forEach((l) => l());
});

function applyLanguage(lang: Language) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore persistence failures — in-memory state still updates
  }
  applyToDocument(lang);
  listeners.forEach((l) => l());
}

export function setLanguage(lang: Language) {
  if (lang === current) return;
  applyLanguage(lang);
  // Keep the Rust side (tray menu, window titles, persisted settings) in sync.
  invoke('set_language', { language: lang }).catch(() => {});
}

export function toggleLanguage() {
  setLanguage(current === 'zh' ? 'en' : 'zh');
}

// Tray menu can also switch the language. Rust broadcasts the change so every
// webview applies it locally (without echoing the invoke back to Rust).
listen<{ language: string }>('language-changed', (event) => {
  applyLanguage(event.payload.language === 'en' ? 'en' : 'zh');
}).catch(() => {});

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = dictionaries[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

/** React hook returning the current language and translation helpers. */
export function useI18n() {
  const lang: Language = useSyncExternalStore(subscribe, () => current, () => 'en');
  return { lang, t, setLanguage, toggleLanguage };
}
