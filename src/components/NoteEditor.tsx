import { useEffect, useRef, useState, useCallback } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { HighlighterColor } from '../types';

interface NoteEditorProps {
  content: string;
  isEditing: boolean;
  highlighterColor: HighlighterColor | null;
  onContentChange: (content: string) => void;
  onToggleEdit: () => void;
  font?: string;
}

// Convert stored =={color}text== markup to HTML for contenteditable display
function markupToHtml(text: string): string {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    escaped = escaped.replace(/==(?:\{(\w+)\})?([^=]+)==/g, (_m, color, content) => {
      const c = color || 'yellow';
      return `<mark class="hl-${c}">${content}</mark>`;
    });

    return escaped;
  }).join('<br>');
}

// Convert contenteditable HTML back to =={color}text== markup for storage
function htmlToMarkup(element: HTMLElement): string {
  let result = '';

  function walk(node: Node, isFirst: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === 'BR') {
        result += '\n';
      } else if (el.tagName === 'MARK') {
        const cls = el.className;
        const match = cls.match(/hl-(\w+)/);
        const color = match ? match[1] : 'yellow';
        const inner = el.textContent || '';
        result += `=={${color}}${inner}==`;
      } else if (el.tagName === 'DIV') {
        // Browsers wrap new lines in <div>
        if (!isFirst && result.length > 0 && !result.endsWith('\n')) {
          result += '\n';
        }
        const children = Array.from(el.childNodes);
        children.forEach((child, i) => walk(child, i === 0));
      } else {
        const children = Array.from(el.childNodes);
        children.forEach((child, i) => walk(child, isFirst && i === 0));
      }
    }
  }

  const children = Array.from(element.childNodes);
  children.forEach((child, i) => walk(child, i === 0));

  return result;
}

export function NoteEditor({
  content,
  isEditing,
  highlighterColor,
  onContentChange,
  onToggleEdit,
  font,
}: NoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const lastContent = useRef(content);
  const [showFront, setShowFront] = useState(isEditing);

  // Initial load
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markupToHtml(content);
      lastContent.current = content;
    }
  }, []);

  // Update editor when content changes externally (not from user typing)
  useEffect(() => {
    if (editorRef.current && content !== lastContent.current) {
      if (!isInternalChange.current) {
        editorRef.current.innerHTML = markupToHtml(content);
      }
      lastContent.current = content;
      isInternalChange.current = false;
    }
  }, [content]);

  // Focus editor when switching to edit mode
  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.focus();
      // Move cursor to end
      const sel = window.getSelection();
      if (sel && editorRef.current.childNodes.length > 0) {
        sel.selectAllChildren(editorRef.current);
        sel.collapseToEnd();
      }
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

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isInternalChange.current = true;
    const markup = htmlToMarkup(editorRef.current);
    lastContent.current = markup;
    onContentChange(markup);
  }, [onContentChange]);

  const handleHighlight = useCallback(() => {
    if (!highlighterColor || !editorRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    try {
      const mark = document.createElement('mark');
      mark.className = `hl-${highlighterColor}`;
      range.surroundContents(mark);
    } catch {
      // Selection crosses element boundaries — use simpler approach
      range.deleteContents();
      const mark = document.createElement('mark');
      mark.className = `hl-${highlighterColor}`;
      mark.textContent = selectedText;
      range.insertNode(mark);
    }

    selection.removeAllRanges();
    handleInput();
  }, [highlighterColor, handleInput]);

  // Strip HTML on paste — only allow plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Prevent Enter from creating <div> — use <br> instead
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  }, []);

  return (
    <div className="note-editor">
      <div className={`page-container ${!isEditing ? 'flipped' : ''}`}>
        {/* Write side */}
        <div className="page page-front">
          <div
            ref={editorRef}
            className="note-editable"
            contentEditable
            onInput={handleInput}
            onMouseUp={handleHighlight}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            data-placeholder="Write something..."
            spellCheck={false}
            suppressContentEditableWarning
            style={font ? { fontFamily: font } : undefined}
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
