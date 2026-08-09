import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useNoteStore } from '../store/noteStore';
import { NoteEditor } from './NoteEditor';
import { ColorPicker } from './ColorPicker';
import { NOTE_FONTS, toDarkPastel, lightenColor, isDarkColor, DEFAULT_FONT_SIZE, stepFontSize, hasMarkdown } from '../types';
import { useTheme } from '../store/theme';
import { useI18n } from '../store/i18n';

interface NoteWindowProps {
  noteId: string;
}

interface AppSettings {
  vault_path: string | null;
  edge_dock_enabled: boolean;
  auto_start: boolean;
}

interface SettingsChangedPayload {
  edge_dock_enabled: boolean;
  auto_start: boolean;
}

const EDGE_SNAP_DEBOUNCE_MS = 300;
const EDGE_AUTO_HIDE_DELAY_MS = 500;
const EDGE_MOVE_BUFFER_MS = 650;

export function NoteWindow({ noteId }: NoteWindowProps) {
  const {
    note,
    isLoading,
    rotation,
    loadNote,
    setContent,
    setColor,
    setFont,
    setFontSize,
    setSize,
    closeNote,
    save,
    pullExternal,
  } = useNoteStore();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const theme = useTheme();
  const { t, lang } = useI18n();
  const [edgeDockEnabled, setEdgeDockEnabled] = useState(false);
  const dockedRef = useRef(false);
  const hiddenRef = useRef(false);
  const mouseInsideRef = useRef(false);
  const suppressMovedUntilRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Keep the OS window title in the active language.
  useEffect(() => {
    getCurrentWindow().setTitle(t('app.noteTitle')).catch(() => {});
  }, [lang, t]);

  // The window is created hidden (see create_note_window). Reveal it only once the note
  // has actually rendered, so it opens smoothly instead of flashing an empty window.
  useEffect(() => {
    if (isLoading) return;
    const win = getCurrentWindow();
    const raf = requestAnimationFrame(() => {
      win.show().catch(() => {});
      win.setFocus().catch(() => {});
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

  // QQ-style edge docking: read the current setting, and react to tray toggles.
  // Turning the feature off reveals any hidden note immediately.
  useEffect(() => {
    let active = true;
    invoke<AppSettings>('get_settings')
      .then((settings) => {
        if (active) setEdgeDockEnabled(settings.edge_dock_enabled);
      })
      .catch(() => {});

    const unlistenP = listen<SettingsChangedPayload>('settings-changed', (event) => {
      setEdgeDockEnabled(event.payload.edge_dock_enabled);
      if (event.payload.edge_dock_enabled) return;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
        moveTimerRef.current = null;
      }
      if (hiddenRef.current) {
        hiddenRef.current = false;
        invoke('reveal_docked_note', { noteId }).catch(() => {});
      }
      dockedRef.current = false;
    });

    return () => {
      active = false;
      unlistenP.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [noteId]);

  const moveNoteToEdge = useCallback(async (autoHide: boolean) => {
    suppressMovedUntilRef.current = performance.now() + EDGE_MOVE_BUFFER_MS;
    if (autoHide) {
      // 正在编辑/输入，或鼠标已经回到窗口内时，绝不自动收起。
      // hasFocus() 保证只有窗口真正持有时才算“编辑中”，避免残留的 DOM 焦点
      // （点过一次编辑器后 activeElement 不会自动清空）把隐藏永久拦截掉。
      const editing =
        document.hasFocus() && !!document.activeElement?.closest('.note-editable');
      if (editing || mouseInsideRef.current) return false;
    }
    try {
      const edge = await invoke<string | null>('snap_note_to_edge', { noteId, autoHide });
      if (autoHide) {
        hiddenRef.current = edge != null;
      } else {
        hiddenRef.current = false;
        dockedRef.current = edge != null;
      }
      return edge != null;
    } catch {
      return false;
    }
  }, [noteId]);

  const revealDockedNote = useCallback(async () => {
    suppressMovedUntilRef.current = performance.now() + EDGE_MOVE_BUFFER_MS;
    try {
      const revealed = await invoke<boolean>('reveal_docked_note', { noteId });
      if (revealed) {
        hiddenRef.current = false;
        dockedRef.current = true;
      }
      return revealed;
    } catch {
      return false;
    }
  }, [noteId]);

  const scheduleAutoHide = useCallback(() => {
    if (!edgeDockEnabled || hiddenRef.current || !dockedRef.current) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      moveNoteToEdge(true);
    }, EDGE_AUTO_HIDE_DELAY_MS);
  }, [edgeDockEnabled, moveNoteToEdge]);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenP = win.onMoved(() => {
      // Programmatic snap/reveal moves are buffered; only user drags schedule a snap.
      if (hiddenRef.current) return;
      if (performance.now() < suppressMovedUntilRef.current) return;
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(() => {
        moveNoteToEdge(false);
      }, EDGE_SNAP_DEBOUNCE_MS);
    });
    return () => {
      unlistenP.then((unlisten) => unlisten()).catch(() => {});
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [moveNoteToEdge]);

  // 输入期间被跳过的那次隐藏，在焦点真正离开后补上（鼠标已不在窗口内时）。
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenP = win.onFocusChanged(({ payload: focused }) => {
      if (!focused && !mouseInsideRef.current) {
        scheduleAutoHide();
      }
    });
    return () => {
      unlistenP.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [scheduleAutoHide]);

  const handleMouseEnter = useCallback(() => {
    mouseInsideRef.current = true;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (hiddenRef.current) {
      revealDockedNote();
    }
  }, [revealDockedNote]);

  const handleMouseLeave = useCallback(() => {
    mouseInsideRef.current = false;
    scheduleAutoHide();
  }, [scheduleAutoHide]);

  const handleStartDrag = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    // Grabbing a hidden note's edge strip reveals it first, so the drag starts
    // from the full window instead of fighting the reveal animation.
    if (hiddenRef.current) {
      hiddenRef.current = false;
      suppressMovedUntilRef.current = performance.now() + EDGE_MOVE_BUFFER_MS;
      try {
        await invoke<boolean>('reveal_docked_note', { noteId });
      } catch {
        // fall through and start dragging anyway
      }
    }
    // 开始拖动说明用户已离开编辑状态：清掉编辑器残留焦点，
    // 否则后续自动收起会被“正在编辑”误判一直拦截。
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.closest('.note-editable')
    ) {
      document.activeElement.blur();
    }
    setIsDragging(true);
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.warn('Window drag failed:', err);
    } finally {
      setIsDragging(false);
    }
  }, [noteId]);

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
    if (e.key === 'Escape') {
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
        <p>{t('note.notFound')}</p>
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
        initial={{ scale: 0.985, opacity: 0, rotateX: 2 }}
        animate={{
          scale: isDragging ? 1.01 : 1,
          opacity: 1,
          rotateX: 2,
          y: isDragging ? -2 : 0,
        }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
              title={t('note.allNotes')}
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
              title={t('note.changeColor')}
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
              title={t('note.font', { name: t(NOTE_FONTS[fontIndex].nameKey) })}
            >
              <span className="font-btn-label" style={{ fontFamily: currentFont }}>Aa</span>
            </button>

            <button
              className="titlebar-btn font-size-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDecreaseFont();
              }}
              title={t('note.smallerText')}
            >
              <span className="font-size-label small">A</span>
            </button>

            <button
              className="titlebar-btn font-size-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleIncreaseFont();
              }}
              title={t('note.largerText')}
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
                title={previewMode ? t('note.switchToEdit') : t('note.previewRendered')}
              >
                {previewMode ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                    <span className="preview-btn-label">{t('note.edit')}</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="preview-btn-label">{t('note.preview')}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* RIGHT: minimize, close */}
          <div className="titlebar-right">
            <button
              className="titlebar-btn minimize-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleMinimize();
              }}
              title={t('note.minimize')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            <button
              className="titlebar-btn close-btn"
              onClick={handleClose}
              title={t('note.closeEsc')}
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
          title={t('note.resize')}
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
