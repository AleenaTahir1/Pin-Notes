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
  toggleEditing: () => void;
  setHighlighterColor: (color: HighlighterColor | null) => void;
  save: () => Promise<void>;
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
    }, 500);
  },

  setColor: (color: string) => {
    const { note } = get();
    if (!note) return;

    set({ note: { ...note, color } });
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
