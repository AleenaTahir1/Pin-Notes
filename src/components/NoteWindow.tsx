import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useNoteStore } from '../store/noteStore';
import { NoteEditor } from './NoteEditor';
import { ColorPicker } from './ColorPicker';
import { DeleteModal } from './DeleteModal';
import { NOTE_FONTS, HIGHLIGHTER_COLORS, HighlighterColor, toDarkPastel, lightenColor, isDarkColor, DEFAULT_FONT_SIZE, FONT_SIZE_STEP, clampFontSize } from '../types';
import { useTheme, toggleTheme } from '../store/theme';

const HIGHLIGHTER_DISPLAY: Record<HighlighterColor, string> = {
  yellow: '#fff59d',
  pink: '#f8bbd9',
  green: '#a5d6a7',
  blue: '#90caf9',
  purple: '#ce93d8',
};

interface NoteWindowProps {
  noteId: string;
}

export function NoteWindow({ noteId }: NoteWindowProps) {
  const {
    note,
    isLoading,
    rotation,
    highlighterColor,
    loadNote,
    setContent,
    setColor,
    setFont,
    setFontSize,
    setHighlighterColor,
    closeNote,
    clearNote,
    save,
    pullExternal,
  } = useNoteStore();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const theme = useTheme();

  // The note remembers its own font; derive the index from the stored value so it
  // restores on reopen. Falls back to the first font when unset/unknown.
  const fontIndex = useMemo(() => {
    const i = NOTE_FONTS.findIndex((f) => f.value === note?.font);
    return i >= 0 ? i : 0;
  }, [note?.font]);

  useEffect(() => {
    loadNote(noteId);
  }, [noteId, loadNote]);

  // Only poll for external (Obsidian) edits when a vault is actually connected.
  // When it isn't (the common case) nothing external changes the note, so we skip
  // the per-window polling entirely to save CPU/battery.
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () =>
      invoke<string | null>('get_sync_status')
        .then((v) => active && setSyncing(!!v))
        .catch(() => {});
    check();
    const id = setInterval(check, 20000); // re-check vault status occasionally (cheap)
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Pick up edits made to this note inside Obsidian. Only refresh while the user is
  // NOT typing in this note's editor, so we never clobber in-progress input.
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(() => {
      const editingHere = document.activeElement?.classList.contains('note-editable');
      if (!editingHere) pullExternal();
    }, 3000);
    return () => clearInterval(interval);
  }, [syncing, pullExternal]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showColorPicker) setShowColorPicker(false);
    };

    if (showColorPicker) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showColorPicker]);

  const handleStartDrag = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.warn('Window drag failed:', err);
    } finally {
      setIsDragging(false);
    }
  }, []);

  const handleClose = useCallback(async () => {
    await closeNote();
  }, [closeNote]);

  const handleMinimize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.minimize();
    } catch (err) {
      console.warn('Minimize failed:', err);
    }
  }, []);

  const handleOpenNotesList = useCallback(async () => {
    try {
      await invoke('open_notes_list');
    } catch (error) {
      console.error('[Pin Notes] Failed to open notes list:', error);
    }
  }, []);

  const handleNewNote = useCallback(async () => {
    try {
      await invoke('create_note', {
        color: '#fff9c4',
        positionX: 300,
        positionY: 300,
      });
    } catch (error) {
      console.error('[Pin Notes] Failed to create note:', error);
    }
  }, []);

  const handleCycleFont = useCallback(() => {
    const next = (fontIndex + 1) % NOTE_FONTS.length;
    setFont(NOTE_FONTS[next].value);
  }, [fontIndex, setFont]);

  // Per-note text size (persisted via note.font_size).
  const fontSize = note?.font_size && note.font_size > 0 ? note.font_size : DEFAULT_FONT_SIZE;
  const handleDecreaseFont = useCallback(() => {
    setFontSize(clampFontSize(fontSize - FONT_SIZE_STEP));
  }, [fontSize, setFontSize]);
  const handleIncreaseFont = useCallback(() => {
    setFontSize(clampFontSize(fontSize + FONT_SIZE_STEP));
  }, [fontSize, setFontSize]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    setShowDeleteModal(false);
    await clearNote();
  }, [clearNote]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteModal(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      handleClose();
    }
    if (e.key === 'Escape' && !showDeleteModal) {
      e.preventDefault();
      handleClose();
    }
  }, [handleClose, showDeleteModal]);

  // In dark mode each note keeps its hue but becomes a dark, pastel-tinted surface.
  const displayColor = useMemo(() => {
    if (!note) return theme === 'dark' ? '#26262e' : '#fff9c4';
    return theme === 'dark' ? toDarkPastel(note.color) : note.color;
  }, [note?.color, theme]);

  const titlebarColor = useMemo(() => {
    if (!note) return displayColor;
    return theme === 'dark' ? lightenColor(displayColor, 0.04) : darkenColor(note.color, 0.02);
  }, [note?.color, theme, displayColor]);

  const currentFont = NOTE_FONTS[fontIndex].value;
  const isDarkBg = isDarkColor(displayColor);

  if (isLoading) {
    return (
      <div className="note-window loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="note-window error">
        <p>Note not found</p>
      </div>
    );
  }

  return (
    <>
      <motion.div
        className={`note-window ${isDragging ? 'dragging' : ''} ${isDarkBg ? 'note-dark-bg' : ''}`}
        style={{
          backgroundColor: displayColor,
          '--note-rotation': `${rotation}deg`,
          '--note-font': currentFont,
          perspective: 1200,
          transformOrigin: 'center 60%',
        } as React.CSSProperties}
        initial={{ scale: 0.9, opacity: 0, rotateX: 2 }}
        animate={{
          scale: isDragging ? 1.01 : 1,
          opacity: 1,
          rotateX: 2,
          y: isDragging ? -2 : 0,
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div
          className="note-titlebar"
          data-tauri-drag-region
          onMouseDown={handleStartDrag}
          style={{ backgroundColor: titlebarColor }}
        >
          {/* LEFT: all notes, color, font */}
          <div className="titlebar-left">
            <button
              className="titlebar-btn menu-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenNotesList();
              }}
              title="All notes"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              className="titlebar-btn color-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowColorPicker(!showColorPicker);
              }}
              title="Change color"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c3.1 0 5.6-2.5 5.6-5.6C23 5.8 18.1 2 12 2z" />
                <circle cx="8" cy="10" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="16" cy="10" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <AnimatePresence>
              {showColorPicker && (
                <ColorPicker
                  key="color-picker"
                  currentColor={note.color}
                  onColorChange={setColor}
                  isOpen={showColorPicker}
                  onClose={() => setShowColorPicker(false)}
                />
              )}
            </AnimatePresence>

            <button
              className="titlebar-btn font-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleCycleFont();
              }}
              title={`Font: ${NOTE_FONTS[fontIndex].name}`}
            >
              <span className="font-btn-label" style={{ fontFamily: currentFont }}>Aa</span>
            </button>

            <button
              className="titlebar-btn font-size-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDecreaseFont();
              }}
              title="Smaller text"
            >
              <span className="font-size-label small">A</span>
            </button>

            <button
              className="titlebar-btn font-size-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleIncreaseFont();
              }}
              title="Larger text"
            >
              <span className="font-size-label large">A</span>
            </button>

            <button
              className="titlebar-btn theme-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleTheme();
              }}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4.5" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="22" y2="12" />
                  <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
                  <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
                  <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
                  <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>

          {/* RIGHT: new note, minimize, delete, close */}
          <div className="titlebar-right">
            <button
              className="titlebar-btn new-note-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleNewNote();
              }}
              title="New note"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <button
              className="titlebar-btn minimize-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
              title="Minimize"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <button
              className="titlebar-btn delete-btn"
              onClick={handleDeleteClick}
              title="Clear note"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,6 5,6 21,6" />
                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
              </svg>
            </button>

            <button
              className="titlebar-btn close-btn"
              onClick={handleClose}
              title="Close (Esc)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="note-content">
          <NoteEditor
            content={note.content}
            highlighterColor={highlighterColor}
            onContentChange={setContent}
            onBlur={save}
            font={currentFont}
            fontSize={fontSize}
          />
          <div className="highlighter-sidebar">
            {(Object.keys(HIGHLIGHTER_COLORS) as HighlighterColor[]).map((color) => (
              <button
                key={color}
                className={`hl-side-dot ${highlighterColor === color ? 'active' : ''}`}
                style={{ backgroundColor: HIGHLIGHTER_DISPLAY[color] }}
                onClick={() => setHighlighterColor(highlighterColor === color ? null : color)}
                title={`${color.charAt(0).toUpperCase() + color.slice(1)} highlighter`}
              />
            ))}
          </div>
        </div>

        <div className="resize-handle" />
      </motion.div>

      <DeleteModal
        isOpen={showDeleteModal}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  );
}

function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * amount));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}
