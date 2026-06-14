import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { Note } from '../types';
import { UpdateChecker } from './UpdateChecker';
import { useTheme, toggleTheme } from '../store/theme';

export function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const theme = useTheme();

  // Load whether an Obsidian vault is connected
  useEffect(() => {
    invoke<string | null>('get_sync_status')
      .then(setVaultPath)
      .catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Set opaque background so no gaps show at window edges (theme-aware)
  useEffect(() => {
    const bg = theme === 'dark' ? '#0e0e0f' : '#e4e4e4';
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, [theme]);

  const loadNotes = useCallback(async () => {
    try {
      const allNotes = await invoke<Note[]>('get_all_notes');
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

  // Filter by search, then sort: pinned first, then by updated_at
  const filteredNotes = useMemo(() => {
    let result = notes;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((note) => {
        const clean = note.content
          .replace(/==\{\w+\}/g, '')
          .replace(/==/g, '')
          .toLowerCase();
        return clean.includes(q);
      });
    }

    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return b.updated_at - a.updated_at;
    });

    return result;
  }, [notes, search]);

  const handleNewNote = async () => {
    try {
      await invoke('create_note', {
        color: '#fff9c4',
        positionX: 200,
        positionY: 200,
      });
      // Minimize the list after creating a note — don't close it, so it stays one click away
      const win = getCurrentWindow();
      await win.minimize();
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

  const handleTogglePin = async (id: string) => {
    try {
      await invoke('toggle_pin_note', { id });
      loadNotes();
    } catch (error) {
      console.error('[Pin Notes] Failed to toggle pin:', error);
    }
  };

  const handleConnectObsidian = async () => {
    try {
      const dir = await open({
        directory: true,
        title: 'Choose your Obsidian vault folder (notes sync both ways)',
      });
      if (typeof dir !== 'string') return; // cancelled
      const count = await invoke<number>('set_obsidian_vault', { dir });
      setVaultPath(dir);
      loadNotes();
      showToast(`Synced ${count} note${count === 1 ? '' : 's'} — editing now works both ways`);
    } catch (error) {
      console.error('[Pin Notes] Failed to connect Obsidian vault:', error);
      showToast('Could not connect vault — see console');
    }
  };

  const handleDisconnectObsidian = async () => {
    try {
      await invoke('disconnect_obsidian');
      setVaultPath(null);
      showToast('Disconnected from Obsidian (files kept)');
    } catch (error) {
      console.error('[Pin Notes] Failed to disconnect:', error);
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
    if ((e.target as HTMLElement).closest('input')) return;
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
            className={`notes-list-theme-btn obsidian-btn ${vaultPath ? 'connected' : ''}`}
            onClick={vaultPath ? handleDisconnectObsidian : handleConnectObsidian}
            title={vaultPath ? 'Disconnect from Obsidian' : 'Connect to Obsidian'}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {vaultPath ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="3" y1="3" x2="21" y2="21" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
          </motion.button>
          <motion.button
            className="notes-list-theme-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {theme === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </motion.button>
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

      <div className="notes-list-search-bar">
        <svg className="notes-list-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          className="notes-list-search-input"
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          spellCheck={false}
        />
        {search && (
          <button
            className="notes-list-search-clear"
            onClick={() => setSearch('')}
            title="Clear search"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className="notes-list-content">
        {filteredNotes.length === 0 ? (
          <motion.div
            className="notes-list-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            {notes.length === 0 ? (
              <>
                <div className="notes-list-empty-icon">📝</div>
                <span>No notes yet</span>
                <span className="notes-list-empty-hint">Click + to create your first note</span>
              </>
            ) : (
              <>
                <div className="notes-list-empty-icon">🔍</div>
                <span>No matches</span>
                <span className="notes-list-empty-hint">Try a different search term</span>
              </>
            )}
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredNotes.map((note, index) => (
              <motion.div
                key={note.id}
                className={`notes-list-item ${note.is_pinned ? 'pinned' : ''}`}
                style={{
                  '--item-glow': `linear-gradient(90deg, ${note.color}, transparent)`,
                  '--item-color': note.color,
                } as React.CSSProperties}
                onClick={() => handleOpenNote(note.id)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
                whileHover={{ x: 4 }}
                layout
              >
                <motion.button
                  className={`notes-list-item-pin ${note.is_pinned ? 'pinned' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePin(note.id);
                  }}
                  title={note.is_pinned ? 'Unpin note' : 'Pin note'}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.8 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={note.is_pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 17v5" />
                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z" />
                  </svg>
                </motion.button>
                <div className="notes-list-item-body">
                  <div className="notes-list-item-preview">
                    {getPreview(note.content)}
                  </div>
                  <div className="notes-list-item-date">
                    {note.is_pinned && <span className="notes-list-pin-label">Pinned</span>}
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
      <AnimatePresence>
        {toast && (
          <motion.div
            className="notes-list-toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <UpdateChecker />
    </div>
  );
}
