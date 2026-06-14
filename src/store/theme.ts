import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pinnotes-theme';

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyToDocument(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

let current: Theme = readStored();
const listeners = new Set<() => void>();

// Apply immediately on module load so every window (each is its own webview, but
// they all share the same localStorage origin) paints in the right theme with no flash.
applyToDocument(current);

// Sync live across all open note windows: a change in one window fires a
// `storage` event in the others.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    current = readStored();
    applyToDocument(current);
    listeners.forEach((l) => l());
  }
});

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore persistence failures — in-memory state still updates
  }
  applyToDocument(theme);
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook returning the current theme, re-rendering on change (this window or another). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current, () => 'light');
}
