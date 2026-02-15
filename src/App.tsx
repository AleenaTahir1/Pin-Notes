import { useEffect, useState } from 'react';
import { NoteWindow } from './components/NoteWindow';
import { NotesList } from './components/NotesList';
import './styles/notes.css';

function App() {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [view, setView] = useState<'note' | 'list'>('note');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const viewParam = params.get('view');
    if (viewParam === 'list') {
      setView('list');
      return;
    }

    const id = params.get('noteId');
    if (id) {
      setNoteId(id);
    }
  }, []);

  if (view === 'list') {
    return <NotesList />;
  }

  if (!noteId) {
    return (
      <div className="note-window loading" style={{ backgroundColor: '#fff9c4' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return <NoteWindow noteId={noteId} />;
}

export default App;
