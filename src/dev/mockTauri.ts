// Dev-only: lets the UI run in a plain browser (`npm run dev`, then open
// http://localhost:1420/?noteId=demo or /?view=list) by faking the Tauri backend in
// memory. Never loaded inside the real app (main.tsx only imports it when the Tauri
// runtime is missing).
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { Note } from '../types';

const now = () => Math.floor(Date.now() / 1000);
const make = (id: string, content: string): Note => ({
  id,
  content,
  color: '#fff9c4',
  position_x: 200,
  position_y: 200,
  width: 280,
  height: 320,
  created_at: now(),
  updated_at: now(),
  is_visible: true,
  is_pinned: false,
  font: '',
  font_size: 0,
  always_on_top: true,
});

const notes = new Map<string, Note>([
  ['demo', make('demo', '')],
  ['todo', make('todo', '# To-do\n\n- [ ] milk\n- [x] eggs\n- [ ] ')],
]);

// Exposed so tests in the browser console can inspect what was "saved".
(window as unknown as { __mockNotes: Map<string, Note>; __saveCount: number }).__mockNotes = notes;
(window as unknown as { __saveCount: number }).__saveCount = 0;

export function installMockTauri() {
  if (location.search.includes('whatsnew')) {
    localStorage.setItem('pinnotes-seen-version', '1.0.10');
  }
  mockWindows('main');
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case 'get_note':
        return notes.get(a.id as string) ?? null;
      case 'get_all_notes':
        return [...notes.values()];
      case 'update_note': {
        const n = { ...(a.note as Note), updated_at: now() };
        notes.set(n.id, n);
        (window as unknown as { __saveCount: number }).__saveCount++;
        return n;
      }
      case 'set_note_on_top':
      case 'close_note':
      case 'open_note':
        return null;
      // ?update shows the update popup, ?whatsnew the after-update card.
      case 'plugin:app|version':
        return location.search.includes('update') ? '1.0.10' : '1.1.0';
      case 'plugin:updater|check':
        return location.search.includes('update')
          ? {
              rid: 1,
              currentVersion: '1.0.10',
              version: '1.1.0',
              date: '',
              body: "## Pin Notes v1.1.0\n\n### What's new\n\n- Smoother writing: the page follows your cursor\n- Undo and redo work everywhere\n- Notes remember where you put them\n- Safer saving with a backup copy\n\n### Installation\n- Windows",
              rawJson: {},
            }
          : null;
      case 'get_sync_status':
        return null;
      case 'get_vault_templates':
        return [];
      default:
        return null;
    }
  }, { shouldMockEvents: true });
}
