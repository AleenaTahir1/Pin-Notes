import { useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { HighlighterColor, HIGHLIGHTER_COLORS } from '../types';

interface NoteEditorProps {
  content: string;
  isEditing: boolean;
  highlighterColor: HighlighterColor | null;
  onContentChange: (content: string) => void;
  onToggleEdit: () => void;
}

export function NoteEditor({
  content,
  isEditing,
  highlighterColor,
  onContentChange,
  onToggleEdit,
}: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showFront, setShowFront] = useState(isEditing);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(content.length, content.length);
    }
  }, [isEditing]);

  useEffect(() => {
    if (showFront !== isEditing) {
      const timeout = setTimeout(() => {
        setShowFront(isEditing);
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [isEditing, showFront]);

  const handleTextSelect = () => {
    if (!highlighterColor || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selectedText = content.substring(start, end);
      const newContent =
        content.substring(0, start) +
        `==${selectedText}==` +
        content.substring(end);
      onContentChange(newContent);
    }
  };

  return (
    <div className="note-editor">
      <div className={`page-container ${!isEditing ? 'flipped' : ''}`}>
        {/* Write side */}
        <div className="page page-front">
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onMouseUp={handleTextSelect}
            placeholder="Write something..."
            spellCheck={false}
            style={highlighterColor ? {
              cursor: 'text',
              caretColor: HIGHLIGHTER_COLORS[highlighterColor],
            } : undefined}
          />
        </div>

        {/* Preview side */}
        <div className="page page-back">
          <div className="note-preview-container">
            <MarkdownRenderer content={content} onClick={onToggleEdit} />
          </div>
        </div>
      </div>

      {/* Flip button */}
      <button
        className={`flip-btn ${!isEditing ? 'flipped' : ''}`}
        onClick={onToggleEdit}
        title={isEditing ? 'Preview' : 'Edit'}
      >
        {isEditing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        )}
      </button>
    </div>
  );
}
