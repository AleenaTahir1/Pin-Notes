import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useNoteStore } from '../store/noteStore';
import { NoteEditor } from './NoteEditor';
import { ColorPicker } from './ColorPicker';
import { NOTE_FONTS, toDarkPastel, lightenColor, isDarkColor, DEFAULT_FONT_SIZE, stepFontSize, hasMarkdown } from '../types';
import { useTheme } from '../store/theme';

interface NoteWindowProps {
  noteId: string;
}

export function NoteWindow({ noteId }: NoteWindowProps) {
  const {
    note,
    isLoading,
    loadNote,
    setContent,
    setColor,
    setFont,
    setFontSize,
    setSize,
    setOnTop,
    closeNote,
    save,
    pullExternal,
  } = useNoteStore();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const theme = useTheme();

  // The preview/edit (eye) toggle only applies to notes that actually contain markdown
  // or rendered template content — plain notes never show it.
  const canPreview = useMemo(() => (note ? hasMarkdown(note.content) : false), [note?.content]);
  // If the markdown is removed (or we load a plain note), drop back to edit mode.
  useEffect(() => {
    if (!canPreview && previewMode) setPreviewMode(false);
  }, [canPreview, previewMode]);

  // The note remembers its own font; derive the index from the stored value so it
  // restores on reopen. Falls back to the first font when unset/unknown.
  const fontIndex = useMemo(() => {
    const i = NOTE_FONTS.findIndex((f) => f.value === note?.font);
    return i >= 0 ? i : 0;
  }, [note?.font]);

  useEffect(() => {
    loadNote(noteId);
  }, [noteId, loadNote]);

  // The window is created hidden (see create_note_window). Reveal it only once the note
  // has actually rendered, so it opens smoothly instead of flashing an empty window.
  useEffect(() => {
    if (isLoading) return;
    const win = getCurrentWindow();
    // Only notes the user just created/opened take focus; restored notes don't grab
    // the keyboard from whatever the user is typing in.
    const takeFocus = new URLSearchParams(window.location.search).get('focus') === '1';
    const raf = requestAnimationFrame(() => {
      win.show().catch(() => {});
      if (takeFocus) win.setFocus().catch(() => {});
    });
    return () => cancelAnimationFrame(raf);
  }, [isLoading]);

  // Persist the window size after the user finishes resizing (debounced). Covers both
  // the corner handle and any OS edge-resize. Tiny sizes (minimize transients) are ignored.
  useEffect(() => {
    const win = getCurrentWindow();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let factor = 1;
    win.scaleFactor().then((f) => { factor = f; }).catch(() => {});
    const unlistenP = win.onResized(({ payload }) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const w = payload.width / factor;
        const h = payload.height / factor;
        if (w < 80 || h < 62) return; // ignore minimize / transient sizes (below the min)
        setSize(w, h);
      }, 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unlistenP.then((un) => un()).catch(() => {});
    };
  }, [setSize]);

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
      const editingHere = !!document.activeElement?.closest('.cm-editor');
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

  // Notes have no taskbar button, so "minimize" hides the note; it comes back from the
  // notes list (click it) or the tray (Show All Notes).
  const handleMinimize = useCallback(async () => {
    try {
      await save();
      await getCurrentWindow().hide();
    } catch (err) {
      console.warn('Hide failed:', err);
    }
  }, [save]);

  const onTop = note?.always_on_top !== false;
  const handleToggleOnTop = useCallback(() => {
    setOnTop(!onTop);
  }, [onTop, setOnTop]);

  const handleOpenNotesList = useCallback(async () => {
    try {
      await invoke('open_notes_list');
    } catch (error) {
      console.error('[Pin Notes] Failed to open notes list:', error);
    }
  }, []);

  const handleCycleFont = useCallback(() => {
    const next = (fontIndex + 1) % NOTE_FONTS.length;
    setFont(NOTE_FONTS[next].value);
  }, [fontIndex, setFont]);

  // Per-note text size (persisted via note.font_size). Two buttons step the presets.
  const fontSize = note?.font_size && note.font_size > 0 ? note.font_size : DEFAULT_FONT_SIZE;
  const handleDecreaseFont = useCallback(() => {
    setFontSize(stepFontSize(fontSize, -1));
  }, [fontSize, setFontSize]);
  const handleIncreaseFont = useCallback(() => {
    setFontSize(stepFontSize(fontSize, 1));
  }, [fontSize, setFontSize]);

  // Drag the corner handle to resize the window. The final size is persisted by the
  // onResized listener below (the drag itself is handled by the OS).
  const handleResizeStart = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await getCurrentWindow().startResizeDragging('SouthEast');
    } catch (err) {
      console.warn('Resize failed:', err);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      handleClose();
    }
  }, [handleClose]);

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
          '--note-font': currentFont,
        } as React.CSSProperties}
        // Flat (2D) on purpose: a 3D tilt blurs text and causes caret repaint glitches
        // in WebView2's transparent windows.
        initial={{ scale: 0.985, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
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

            {/* Preview / edit toggle — only on notes that contain markdown / templates.
                Shows the action you'll get: "Preview" (eye) while editing, "Edit"
                (pencil, highlighted) while previewing. */}
            {canPreview && (
              <button
                className={`titlebar-btn preview-btn ${previewMode ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMode((v) => !v);
                }}
                title={previewMode ? 'Switch to editing' : 'Preview the rendered note'}
              >
                {previewMode ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                    <span className="preview-btn-label">Edit</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="preview-btn-label">Preview</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* RIGHT: keep on top, minimize, close */}
          <div className="titlebar-right">
            <button
              className={`titlebar-btn ontop-btn ${onTop ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleOnTop();
              }}
              title={onTop ? 'Keeping on top of other windows (click to stop)' : 'Keep on top of other windows'}
              aria-pressed={onTop}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={onTop ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
            </button>
            <button
              className="titlebar-btn minimize-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
              title="Hide (reopen from All notes or the tray)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <button
              className="titlebar-btn close-btn"
              onClick={handleClose}
              title="Close (Ctrl+W)"
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
            onContentChange={setContent}
            onBlur={save}
            font={currentFont}
            fontSize={fontSize}
            previewMode={previewMode}
          />
        </div>

        <div
          className="resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      </motion.div>
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
