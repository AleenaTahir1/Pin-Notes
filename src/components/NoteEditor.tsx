import { useEffect, useRef, useCallback } from 'react';
import { HighlighterColor } from '../types';

interface NoteEditorProps {
  content: string;
  highlighterColor: HighlighterColor | null;
  onContentChange: (content: string) => void;
  onBlur?: () => void;
  font?: string;
  fontSize?: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Render one line's inline markdown to HTML: inline code, highlights, bold, italic,
// strikethrough. Inline code is processed first so its contents aren't reformatted.
function inlineToHtml(raw: string): string {
  let s = escapeHtml(raw);

  // Inline code: `code`
  s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  // Colored highlights: =={color}text== (or bare ==text==)
  s = s.replace(/==(?:\{(\w+)\})?([^\n]+?)==/g, (_m, color, content) => {
    const c = color || 'yellow';
    return `<mark class="hl-${c}">${content}</mark>`;
  });
  // Bold first (so its ** isn't consumed by the italic pass)
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // Strikethrough: ~~text~~
  s = s.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
  // Italic with * … *
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  // Italic with _ … _ — only at word boundaries so snake_case is left alone
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');

  return s;
}

// Split any multi-line highlight into one highlight per line, so each line can live in
// its own block <div> (a <mark> can't span block boundaries in the div-per-line model).
function splitHighlightsPerLine(text: string): string {
  return text.replace(/==(\{\w+\})?([\s\S]*?)==/g, (_m, tag, body) => {
    const t = tag || '';
    if (!body.includes('\n')) return `==${t}${body}==`;
    return body
      .split('\n')
      .map((p: string) => (p === '' ? '' : `==${t}${p}==`))
      .join('\n');
  });
}

// Render one stored line to a block <div>. Each line becomes its own block; the markdown
// markers (#, -, >, [ ]) are not shown but are restored on serialize via blockPrefix.
function lineToHtml(line: string): string {
  // Headings # … ######
  let m = line.match(/^(#{1,6})\s+(.*)$/);
  if (m) return `<div class="md-h${m[1].length}">${inlineToHtml(m[2]) || '<br>'}</div>`;

  // Task list item: - [ ] / - [x]
  m = line.match(/^[-*]\s+\[([ xX])\]\s*(.*)$/);
  if (m) {
    const checked = m[1].toLowerCase() === 'x';
    const inner = inlineToHtml(m[2]) || '<br>';
    return (
      `<div class="md-task">` +
      `<span class="md-check" contenteditable="false" data-checked="${checked}"></span>` +
      `<span class="md-li-body">${inner}</span>` +
      `</div>`
    );
  }

  // Bullet list item: - … / * …
  m = line.match(/^[-*]\s+(.*)$/);
  if (m) return `<div class="md-li">${inlineToHtml(m[1]) || '<br>'}</div>`;

  // Blockquote: > …
  m = line.match(/^>\s?(.*)$/);
  if (m) return `<div class="md-quote">${inlineToHtml(m[1]) || '<br>'}</div>`;

  const inner = inlineToHtml(line);
  return `<div>${inner === '' ? '<br>' : inner}</div>`;
}

// Convert stored markup to HTML for the contenteditable (one block <div> per line).
function markupToHtml(text: string): string {
  if (text === '') return '';
  return splitHighlightsPerLine(text).split('\n').map(lineToHtml).join('');
}

// The leading markdown marker a block serializes back to (#, -, > , - [x] …).
function blockPrefix(el: HTMLElement): string {
  if (el.classList.contains('md-task')) {
    const chk = el.querySelector('.md-check');
    return chk?.getAttribute('data-checked') === 'true' ? '- [x] ' : '- [ ] ';
  }
  if (el.classList.contains('md-li')) return '- ';
  if (el.classList.contains('md-quote')) return '> ';
  const m = el.className.match(/md-h([1-6])/);
  return m ? '#'.repeat(Number(m[1])) + ' ' : '';
}

// Serialize an inline node back to markup (text / mark / bold / italic / strike / code).
function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  // The checkbox glyph is rendered chrome, not content — its state lives in blockPrefix.
  if (el.classList.contains('md-check')) return '';
  switch (el.tagName) {
    case 'BR':
      return '\n';
    case 'MARK': {
      const m = el.className.match(/hl-(\w+)/);
      return `=={${m ? m[1] : 'yellow'}}${serializeChildren(el)}==`;
    }
    case 'STRONG':
    case 'B':
      return `**${serializeChildren(el)}**`;
    case 'EM':
    case 'I':
      return `*${serializeChildren(el)}*`;
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return `~~${serializeChildren(el)}~~`;
    case 'CODE':
      return `\`${serializeChildren(el)}\``;
    default:
      return serializeChildren(el);
  }
}

// Serialize an element's children, dropping a trailing lone <br> (the browser's
// empty-line filler). Mid-content <br>s become newlines.
function serializeChildren(el: HTMLElement): string {
  const kids = Array.from(el.childNodes);
  let s = '';
  kids.forEach((k, i) => {
    if (k.nodeType === Node.ELEMENT_NODE && (k as HTMLElement).tagName === 'BR') {
      if (i !== kids.length - 1) s += '\n';
    } else {
      s += serializeInlineNode(k);
    }
  });
  return s;
}

// One block element (<div>/<p>) = one line.
function serializeBlock(el: HTMLElement): string {
  return serializeChildren(el);
}

// Convert contenteditable HTML back to stored markup (with #/**/* and =={color} markers).
function htmlToMarkup(element: HTMLElement): string {
  const lines: string[] = [];
  const appendInline = (s: string) => {
    if (lines.length === 0) lines.push('');
    lines[lines.length - 1] += s;
  };

  element.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.tagName === 'DIV' || el.tagName === 'P') {
        lines.push(blockPrefix(el) + serializeBlock(el));
      } else if (el.tagName === 'BR') {
        lines.push('');
      } else {
        appendInline(serializeInlineNode(el));
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      appendInline(child.textContent || '');
    }
  });

  return lines.join('\n');
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
  onBlur,
  font,
  fontSize,
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

  // Toggle a task checkbox when its glyph is clicked (the span is contenteditable=false).
  const handleClick = useCallback((e: React.MouseEvent) => {
    const check = (e.target as HTMLElement).closest('.md-check');
    if (!check) return;
    const next = check.getAttribute('data-checked') !== 'true';
    check.setAttribute('data-checked', String(next));
    handleInput();
  }, [handleInput]);

  // Strip HTML on paste — only allow plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Create a real block break (new <div> line) so headings/lines serialize cleanly.
      e.preventDefault();
      document.execCommand('insertParagraph');
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
        onClick={handleClick}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        data-placeholder="Write something..."
        spellCheck={false}
        suppressContentEditableWarning
        style={{
          ...(font ? { fontFamily: font } : {}),
          ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
        }}
      />
    </div>
  );
}
