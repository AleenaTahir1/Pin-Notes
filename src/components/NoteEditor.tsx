import { useEffect, useRef, useCallback } from 'react';
import { HighlighterColor } from '../types';

interface NoteEditorProps {
  content: string;
  highlighterColor: HighlighterColor | null;
  onContentChange: (content: string) => void;
  font?: string;
}

// Convert stored =={color}text== markup to HTML for contenteditable display
// Handles multiline highlights: =={pink}line1\nline2== → <mark>line1<br>line2</mark>
function markupToHtml(text: string): string {
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Match highlights that may span multiple lines (lazy match)
  escaped = escaped.replace(/==(?:\{(\w+)\})?([\s\S]+?)==/g, (_m, color, content) => {
    const c = color || 'yellow';
    const htmlContent = content.replace(/\n/g, '<br>');
    return `<mark class="hl-${c}">${htmlContent}</mark>`;
  });

  // Convert remaining newlines (outside highlights) to <br>
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
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
        // Walk children to preserve <br> as newlines inside highlights
        result += `=={${color}}`;
        Array.from(el.childNodes).forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            result += child.textContent || '';
          } else if ((child as HTMLElement).tagName === 'BR') {
            result += '\n';
          } else {
            result += child.textContent || '';
          }
        });
        result += '==';
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

// Check if a node is inside a <mark> element within a container
function findParentMark(node: Node | null, container: HTMLElement): HTMLElement | null {
  while (node && node !== container) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'MARK') {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }
  return null;
}

export function NoteEditor({
  content,
  highlighterColor,
  onContentChange,
  font,
}: NoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const lastContent = useRef<string | null>(null);
  const initializedRef = useRef(false);

  // Render content into the editor whenever it changes externally
  useEffect(() => {
    if (!editorRef.current) return;

    // Skip if this change came from user typing
    if (isInternalChange.current) {
      isInternalChange.current = false;
      lastContent.current = content;
      return;
    }

    // Skip if content hasn't actually changed
    if (content === lastContent.current) return;

    // Save cursor position for external updates after init
    const sel = window.getSelection();
    let savedOffset = -1;
    if (initializedRef.current && sel && sel.rangeCount > 0) {
      try {
        const range = sel.getRangeAt(0);
        const preRange = document.createRange();
        preRange.selectNodeContents(editorRef.current);
        preRange.setEnd(range.startContainer, range.startOffset);
        savedOffset = preRange.toString().length;
      } catch {
        // ignore
      }
    }

    editorRef.current.innerHTML = markupToHtml(content);
    lastContent.current = content;
    initializedRef.current = true;

    // Restore cursor
    if (savedOffset >= 0 && sel) {
      try {
        const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          const len = node.textContent?.length || 0;
          if (charCount + len >= savedOffset) {
            const range = document.createRange();
            range.setStart(node, savedOffset - charCount);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            break;
          }
          charCount += len;
        }
      } catch {
        // ignore
      }
    }
  }, [content]);

  // When highlighter is deselected, move cursor out of any <mark> element
  // so the browser won't keep inserting typed text inside the mark
  useEffect(() => {
    if (highlighterColor !== null || !editorRef.current) return;

    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return;

    const markEl = findParentMark(sel.anchorNode, editorRef.current);
    if (markEl) {
      const range = document.createRange();
      range.setStartAfter(markEl);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [highlighterColor]);

  // Auto-focus editor on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel && editorRef.current.childNodes.length > 0) {
        sel.selectAllChildren(editorRef.current);
        sel.collapseToEnd();
      }
    }
  }, []);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }

    // When highlighter is off and cursor is inside a <mark>, intercept typed
    // characters and insert them OUTSIDE the mark so they aren't highlighted
    if (
      highlighterColor === null &&
      e.key.length === 1 &&
      !e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return;

      const markEl = findParentMark(sel.anchorNode, editorRef.current);
      if (markEl) {
        e.preventDefault();
        // Insert the character as a text node right after the mark
        const textNode = document.createTextNode(e.key);
        markEl.parentNode!.insertBefore(textNode, markEl.nextSibling);
        // Place cursor after the inserted character
        const range = document.createRange();
        range.setStart(textNode, textNode.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        handleInput();
      }
    }
  }, [highlighterColor, handleInput]);

  return (
    <div className="note-editor">
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
  );
}
