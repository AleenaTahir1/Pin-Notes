import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Note, HighlighterColor, getRandomRotation } from '../types';

interface NoteStore {
  note: Note | null;
  isEditing: boolean;
  isLoading: boolean;
  error: string | null;
  highlighterColor: HighlighterColor | null;
  rotation: number;

  loadNote: (id: string) => Promise<void>;
  setContent: (content: string) => void;
  setColor: (color: string) => void;
  setFont: (font: string) => void;
  setFontSize: (size: number) => void;
  setSize: (width: number, height: number) => void;
  toggleEditing: () => void;
  setHighlighterColor: (color: HighlighterColor | null) => void;
  save: () => Promise<void>;
  pullExternal: () => Promise<void>;
  clearNote: () => Promise<void>;
  deleteNote: () => Promise<void>;
  closeNote: () => Promise<void>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useNoteStore = create<NoteStore>((set, get) => ({
  note: null,
  isEditing: true,
  isLoading: true,
  error: null,
  highlighterColor: null,
  rotation: getRandomRotation(),

  loadNote: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      const note = await invoke<Note | null>('get_note', { id });
      if (note) {
        set({ note, isLoading: false });
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
      get().save();
    }, 100);
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

  toggleEditing: () => {
    set((state) => ({ isEditing: !state.isEditing }));
  },

  setHighlighterColor: (color: HighlighterColor | null) => {
    set({ highlighterColor: color });
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
        set({ note: fresh });
      }
    } catch (error) {
      console.warn('[Pin Notes] External refresh failed:', error);
    }
  },

  clearNote: async () => {
    const { note } = get();
    if (!note) return;

    try {
      const cleared = await invoke<Note>('clear_note', { id: note.id });
      set({ note: cleared, isEditing: true });
    } catch (error) {
      console.error('[Pin Notes] Failed to clear note:', error);
    }
  },

  deleteNote: async () => {
    const { note } = get();
    if (!note) return;

    try {
      await invoke('delete_note', { id: note.id });
    } catch (error) {
      console.error('[Pin Notes] Failed to delete note:', error);
    }
  },

  closeNote: async () => {
    const { note } = get();
    if (!note) return;

    try {
      await invoke('close_note', { id: note.id });
    } catch (error) {
      console.error('[Pin Notes] Failed to close note:', error);
    }
  },
}));
