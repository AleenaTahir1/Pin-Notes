import { useState, useEffect, useCallback } from 'react';
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

  const handleNewNote = async () => {
    try {
      await invoke('create_note', {
        color: '#fff59d',
        position_x: 200,
        position_y: 200,
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
    const clean = firstLine.replace(/[#*_~`=]/g, '').trim();
    return clean || 'Empty note';
  };

  return (
    <div className="notes-list-window">
      <div className="notes-list-header" onMouseDown={handleDrag}>
        <span className="notes-list-title">Notes</span>
        <div className="notes-list-actions">
          <button className="notes-list-add-btn" onClick={handleNewNote} title="New note">
            +
          </button>
          <button className="notes-list-close-btn" onClick={handleClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="notes-list-content">
        {notes.length === 0 ? (
          <div className="notes-list-empty">
            <div className="notes-list-empty-icon">📝</div>
            <span>No notes yet</span>
          </div>
        ) : (
          notes.map(note => (
            <div
              key={note.id}
              className="notes-list-item"
              style={{ borderLeftColor: note.color }}
              onClick={() => handleOpenNote(note.id)}
            >
              <div
                className="notes-list-item-color"
                style={{ backgroundColor: note.color }}
              />
              <div className="notes-list-item-body">
                <div className="notes-list-item-preview">
                  {getPreview(note.content)}
                </div>
                <div className="notes-list-item-date">
                  {formatDate(note.updated_at)}
                </div>
              </div>
              <button
                className="notes-list-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteNote(note.id);
                }}
                title="Delete"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
