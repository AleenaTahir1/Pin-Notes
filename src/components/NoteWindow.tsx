import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useNoteStore } from '../store/noteStore';
import { NoteEditor } from './NoteEditor';
import { ColorPicker } from './ColorPicker';
import { DeleteModal } from './DeleteModal';
import { HighlighterPicker } from './HighlighterPicker';

interface NoteWindowProps {
  noteId: string;
}

export function NoteWindow({ noteId }: NoteWindowProps) {
  const {
    note,
    isEditing,
    isLoading,
    rotation,
    highlighterColor,
    loadNote,
    setContent,
    setColor,
    toggleEditing,
    setHighlighterColor,
    closeNote,
    clearNote,
  } = useNoteStore();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlighterPicker, setShowHighlighterPicker] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    loadNote(noteId);
  }, [noteId, loadNote]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showColorPicker) setShowColorPicker(false);
      if (showHighlighterPicker) setShowHighlighterPicker(false);
    };

    if (showColorPicker || showHighlighterPicker) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showColorPicker, showHighlighterPicker]);

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

  const titlebarColor = useMemo(() => {
    if (!note) return '#fff59d';
    return darkenColor(note.color, 0.03);
  }, [note?.color]);

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
        className={`note-window note-appear ${isDragging ? 'dragging' : ''}`}
        style={{
          backgroundColor: note.color,
          '--note-rotation': `${rotation}deg`,
        } as React.CSSProperties}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div className="note-pin" />

        <div
          className="note-titlebar"
          data-tauri-drag-region
          onMouseDown={handleStartDrag}
          style={{ backgroundColor: titlebarColor }}
        >
          <div className="titlebar-left">
            <button
              className="titlebar-btn color-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowColorPicker(!showColorPicker);
                setShowHighlighterPicker(false);
              }}
              title="Change color"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8" />
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
          </div>

          <div className="titlebar-center">
            <button
              className={`titlebar-btn highlighter-btn ${highlighterColor ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowHighlighterPicker(!showHighlighterPicker);
                setShowColorPicker(false);
              }}
              title="Highlighter"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" fill="currentColor" />
              </svg>
            </button>
            <AnimatePresence>
              {showHighlighterPicker && (
                <HighlighterPicker
                  key="highlighter-picker"
                  currentColor={highlighterColor}
                  onColorSelect={setHighlighterColor}
                  onClose={() => setShowHighlighterPicker(false)}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="titlebar-right">
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
            isEditing={isEditing}
            highlighterColor={highlighterColor}
            onContentChange={setContent}
            onToggleEdit={toggleEditing}
          />
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
