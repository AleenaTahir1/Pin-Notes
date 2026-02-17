import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Note } from '../types';

export function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);

  const loadNotes = useCallback(async () => {
    try {
      const allNotes = await invoke<Note[]>('get_all_notes');
      allNotes.sort((a, b) => b.updated_at - a.updated_at);
      setNotes(allNotes);
    } catch (error) {
      console.error('[Pin Notes] Failed to load notes:', error);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Refresh when window gets focus
  useEffect(() => {
    const handleFocus = () => loadNotes();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadNotes]);

  // Auto-refresh every 2s so list stays current as notes are edited
  useEffect(() => {
    const interval = setInterval(loadNotes, 2000);
    return () => clearInterval(interval);
  }, [loadNotes]);

  const handleNewNote = async () => {
    try {
      await invoke('create_note', {
        color: '#fff9c4',
        positionX: 200,
        positionY: 200,
      });
      loadNotes();
    } catch (error) {
      console.error('[Pin Notes] Failed to create note:', error);
    }
  };

  const handleOpenNote = async (id: string) => {
    try {
      await invoke('open_note', { id });
    } catch (error) {
      console.error('[Pin Notes] Failed to open note:', error);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await invoke('delete_note', { id });
      loadNotes();
    } catch (error) {
      console.error('[Pin Notes] Failed to delete note:', error);
    }
  };

  const handleMinimize = async () => {
    try {
      const win = getCurrentWindow();
      await win.minimize();
    } catch (error) {
      console.error('[Pin Notes] Failed to minimize:', error);
    }
  };

  const handleClose = async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch (error) {
      console.error('[Pin Notes] Failed to close:', error);
    }
  };

  const handleDrag = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.warn('Drag failed:', err);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getPreview = (content: string) => {
    const firstLine = content.split('\n').find(line => line.trim() !== '');
    if (!firstLine) return 'Empty note';
    const clean = firstLine
      .replace(/==\{\w+\}/g, '')
      .replace(/==/g, '')
      .replace(/[#*_~`]/g, '')
      .trim();
    return clean || 'Empty note';
  };

  return (
    <div className="notes-list-window">
      <div className="notes-list-header" onMouseDown={handleDrag}>
        <span className="notes-list-title">Notes</span>
        <div className="notes-list-actions">
          <motion.button
            className="notes-list-add-btn"
            onClick={handleNewNote}
            title="New note"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            +
          </motion.button>
          <motion.button
            className="notes-list-minimize-btn"
            onClick={handleMinimize}
            title="Minimize"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </motion.button>
          <motion.button
            className="notes-list-close-btn"
            onClick={handleClose}
            title="Close"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </motion.button>
        </div>
      </div>

      <div className="notes-list-content">
        {notes.length === 0 ? (
          <motion.div
            className="notes-list-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="notes-list-empty-icon">📝</div>
            <span>No notes yet</span>
            <span className="notes-list-empty-hint">Click + to create your first note</span>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {notes.map((note, index) => (
              <motion.div
                key={note.id}
                className="notes-list-item"
                style={{ '--item-glow': `linear-gradient(90deg, ${note.color}, transparent)` } as React.CSSProperties}
                onClick={() => handleOpenNote(note.id)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
                whileHover={{ x: 4 }}
                layout
              >
                <div className="notes-list-item-body">
                  <div className="notes-list-item-preview">
                    {getPreview(note.content)}
                  </div>
                  <div className="notes-list-item-date">
                    {formatDate(note.updated_at)}
                  </div>
                </div>
                <motion.button
                  className="notes-list-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                  title="Delete"
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.8 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
