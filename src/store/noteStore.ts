import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Note, normalizeTaskShorthand } from '../types';

interface NoteStore {
  note: Note | null;
  isLoading: boolean;
  error: string | null;

  loadNote: (id: string) => Promise<void>;
  setContent: (content: string) => void;
  setColor: (color: string) => void;
  setFont: (font: string) => void;
  setFontSize: (size: number) => void;
  setSize: (width: number, height: number) => void;
  setOnTop: (onTop: boolean) => Promise<void>;
  save: () => Promise<void>;
  pullExternal: () => Promise<void>;
  closeNote: () => Promise<void>;
}

// Typing is sent to the app shortly after a pause. That only updates memory (the app
// writes to disk in the background), so this can be short.
const SAVE_DELAY_MS = 150;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useNoteStore = create<NoteStore>((set, get) => ({
  note: null,
  isLoading: true,
  error: null,

  loadNote: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const note = await invoke<Note | null>('get_note', { id });
      if (note) {
        set({ note: { ...note, content: normalizeTaskShorthand(note.content) }, isLoading: false });
      } else {
        set({ error: 'Note not found', isLoading: false });
      }
    } catch (error) {
      console.error('[Pin Notes] Failed to load note:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  setContent: (content: string) => {
    const { note } = get();
    if (!note) return;

    set({ note: { ...note, content } });

    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      get().save();
    }, SAVE_DELAY_MS);
  },

  setColor: (color: string) => {
    const { note } = get();
    if (!note) return;

    set({ note: { ...note, color } });
    get().save();
  },

  setFont: (font: string) => {
    const { note } = get();
    if (!note) return;

    set({ note: { ...note, font } });
    get().save();
  },

  setFontSize: (size: number) => {
    const { note } = get();
    if (!note) return;

    set({ note: { ...note, font_size: size } });
    get().save();
  },

  // Persist the note's window size so it reopens as the user left it. Called when a
  // corner-drag resize finishes (rounded to whole px).
  setSize: (width: number, height: number) => {
    const { note } = get();
    if (!note) return;
    const w = Math.round(width);
    const h = Math.round(height);
    if (note.width === w && note.height === h) return;

    set({ note: { ...note, width: w, height: h } });
    get().save();
  },

  setOnTop: async (onTop: boolean) => {
    const { note } = get();
    if (!note) return;
    set({ note: { ...note, always_on_top: onTop } });
    try {
      await invoke('set_note_on_top', { id: note.id, onTop });
    } catch (error) {
      console.error('[Pin Notes] Failed to change keep-on-top:', error);
    }
  },

  save: async () => {
    const { note } = get();
    if (!note) return;

    try {
      await invoke<Note>('update_note', { note });
    } catch (error) {
      console.error('[Pin Notes] Failed to save note:', error);
    }
  },

  // Silently refresh this note from storage if it changed underneath us (e.g. the
  // user edited the matching file in Obsidian and the background sync pulled it in).
  // Caller is responsible for only invoking this when the editor isn't being typed in.
  pullExternal: async () => {
    const { note } = get();
    if (!note) return;
    try {
      const fresh = await invoke<Note | null>('get_note', { id: note.id });
      if (fresh && fresh.content !== note.content) {
        set({ note: { ...note, content: fresh.content, updated_at: fresh.updated_at } });
      }
    } catch (error) {
      console.warn('[Pin Notes] External refresh failed:', error);
    }
  },

  closeNote: async () => {
    const { note } = get();
    if (!note) return;

    // Send any typing that hasn't been saved yet before the window goes away.
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await get().save();

    try {
      await invoke('close_note', { id: note.id });
    } catch (error) {
      console.error('[Pin Notes] Failed to close note:', error);
    }
  },
}));
