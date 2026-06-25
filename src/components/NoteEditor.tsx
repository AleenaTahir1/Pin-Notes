import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { HighlighterColor } from '../types';

interface NoteEditorProps {
  content: string;
  onContentChange: (content: string) => void;
  onBlur?: () => void;
  font?: string;
  fontSize?: number;
  previewMode?: boolean;
}

// Solid swatch colors for the selection popover dots (the stored highlight uses the
// softer translucent HIGHLIGHTER_COLORS; these are just the picker chips).
const HL_SWATCH: Record<HighlighterColor, string> = {
  yellow: '#fff59d',
  pink: '#f8bbd9',
  green: '#a5d6a7',
  blue: '#90caf9',
  purple: '#ce93d8',
};
const HL_ORDER: HighlighterColor[] = ['yellow', 'pink', 'green', 'blue', 'purple'];

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

  // Task list item: - [ ] / - [x]. The space after the dash is optional so both the
  // standard `- [ ]` and the shorthand `-[ ]` render to a real checkbox on reopen. The
  // checkbox is a CSS ::before marker on the line (state in data-checked) — NOT an inline
  // non-editable span — so the line edits like any normal text line.
  m = line.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
  if (m) {
    const checked = m[1].toLowerCase() === 'x';
    const inner = inlineToHtml(m[2]) || '<br>';
    return `<div class="md-task" data-checked="${checked}">${inner}</div>`;
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
    return el.getAttribute('data-checked') === 'true' ? '- [x] ' : '- [ ] ';
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
  onContentChange,
  onBlur,
  font,
  fontSize,
  previewMode = false,
}: NoteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const lastContent = useRef<string | null>(null);
  const initializedRef = useRef(false);
  // Floating highlight strip — only shown while text is selected. Rendered through a
  // portal to <body> with viewport (fixed) coords so the note's overflow:hidden can't
  // clip it. We store the selection anchor; the actual on-screen position is computed
  // after measuring the strip (useLayoutEffect) and clamped inside the window so it can
  // never be cut off on any edge.
  const [anchor, setAnchor] = useState<{ cx: number; top: number; bottom: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  // Keep the line the caret is on within the visible area of the scroller. Without
  // this, pressing Enter at the bottom of a long note drops the caret below the fold
  // and the editor never scrolls to follow it.
  const ensureCaretVisible = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node: Node | null = sel.getRangeAt(0).endContainer;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    let el = node as HTMLElement | null;
    // climb to the direct block child of the editor (the current "line")
    while (el && el.parentElement && el.parentElement !== editor) el = el.parentElement;
    if (!el || el === editor) return;
    const er = editor.getBoundingClientRect();
    const lr = el.getBoundingClientRect();
    const margin = 6;
    if (lr.bottom > er.bottom - margin) {
      editor.scrollTop += lr.bottom - (er.bottom - margin);
    } else if (lr.top < er.top + margin) {
      editor.scrollTop -= (er.top + margin) - lr.top;
    }
  }, []);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isInternalChange.current = true;
    const markup = htmlToMarkup(editorRef.current);
    lastContent.current = markup;
    onContentChange(markup);
    requestAnimationFrame(ensureCaretVisible);
  }, [onContentChange, ensureCaretVisible]);

  // Show the highlight strip above the current selection (or hide it if the
  // selection is empty / outside the editor).
  const updatePopover = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setAnchor(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      setAnchor(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setAnchor(null);
      return;
    }
    setAnchor({ cx: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  }, []);

  // Position the strip after it's rendered/measured: prefer above the selection, fall
  // back to below, and clamp inside the window on every edge so it's never clipped.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !anchor) return;
    const m = 8;
    const gap = 8;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let left = anchor.cx - pw / 2;
    left = Math.min(Math.max(left, m), Math.max(m, winW - pw - m));

    const aboveTop = anchor.top - gap - ph;
    const belowTop = anchor.bottom + gap;
    let top: number;
    if (aboveTop >= m) top = aboveTop;
    else if (belowTop + ph <= winH - m) top = belowTop;
    else top = Math.min(Math.max(aboveTop, m), Math.max(m, winH - ph - m));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  }, [anchor]);

  // Wrap the current selection in a highlight of the given color.
  const applyHighlight = useCallback((color: HighlighterColor) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const selectedText = range.toString();
    if (!selectedText) return;

    try {
      const mark = document.createElement('mark');
      mark.className = `hl-${color}`;
      range.surroundContents(mark);
    } catch {
      // Selection crosses element boundaries — use simpler approach
      range.deleteContents();
      const mark = document.createElement('mark');
      mark.className = `hl-${color}`;
      mark.textContent = selectedText;
      range.insertNode(mark);
    }

    selection.removeAllRanges();
    setAnchor(null);
    handleInput();
  }, [handleInput]);

  // Remove any highlight(s) overlapping the current selection — unwrap the <mark>(s)
  // back to plain text. Fixes the old "a highlight can never be taken off" problem.
  const removeHighlight = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const marks = Array.from(editor.querySelectorAll('mark')).filter((m) =>
      range.intersectsNode(m)
    );
    if (marks.length === 0) {
      const parent = findParentMark(selection.anchorNode, editor);
      if (parent) marks.push(parent);
    }
    marks.forEach((m) => {
      const p = m.parentNode;
      if (!p) return;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
    });

    selection.removeAllRanges();
    setAnchor(null);
    handleInput();
  }, [handleInput]);

  // Toggle a task checkbox when its ::before glyph (the left ~1.4em of the line) is
  // clicked. Clicks further right just place the caret in the text as normal.
  const handleClick = useCallback((e: React.MouseEvent) => {
    const task = (e.target as HTMLElement).closest('.md-task') as HTMLElement | null;
    if (!task) return;
    // The checkbox glyph lives in the line's left padding; clicks there toggle, clicks
    // in the text don't. Using the actual padding keeps the target right at any font size.
    const x = e.clientX - task.getBoundingClientRect().left;
    const padLeft = parseFloat(getComputedStyle(task).paddingLeft) || 26;
    if (x > padLeft) return;
    e.preventDefault();
    const next = task.getAttribute('data-checked') !== 'true';
    task.setAttribute('data-checked', String(next));
    handleInput();
  }, [handleInput]);

  // Strip HTML on paste — only allow plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // The block (direct child of the editor) the caret currently sits in, if any.
  const currentBlock = useCallback((): HTMLElement | null => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    let block = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node) as HTMLElement | null;
    while (block && block.parentElement && block.parentElement !== editor) block = block.parentElement;
    return block && block.parentElement === editor ? block : null;
  }, []);

  // Is the caret at the very start of this block (nothing but the caret before it)?
  const caretAtBlockStart = useCallback((block: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(block);
    try {
      pre.setEnd(range.startContainer, range.startOffset);
    } catch {
      return false;
    }
    return pre.toString().length === 0;
  }, []);

  // Replace a formatted block (heading / quote / bullet / checkbox) with a plain <div>,
  // keeping its body text and putting the caret at the start.
  const convertBlockToPlain = useCallback((block: HTMLElement) => {
    const sel = window.getSelection();
    if (!sel) return;
    const plain = document.createElement('div');
    while (block.firstChild) plain.appendChild(block.firstChild);
    if (plain.childNodes.length === 0) plain.appendChild(document.createElement('br'));
    block.replaceWith(plain);
    const r = document.createRange();
    r.setStart(plain, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    handleInput();
    requestAnimationFrame(ensureCaretVisible);
  }, [handleInput, ensureCaretVisible]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Backspace at the very start of a formatted block strips it back to a plain line.
    // For a heading this replaces the browser's odd "font gets bigger" behavior; for a
    // bullet/checkbox it cleanly drops the marker (a way out of the list).
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      const block = currentBlock();
      if (sel && sel.isCollapsed && block) {
        const isFormatted =
          /md-h[1-6]/.test(block.className) ||
          block.classList.contains('md-quote') ||
          block.classList.contains('md-task') ||
          block.classList.contains('md-li');
        if (isFormatted && caretAtBlockStart(block)) {
          e.preventDefault();
          convertBlockToPlain(block);
          return;
        }
      }
    }

    if (e.key === 'Enter') {
      const sel = window.getSelection();
      const block = currentBlock();
      if (sel && sel.rangeCount > 0 && block) {
        const isHeading = /md-h[1-6]/.test(block.className);
        const isTask = block.classList.contains('md-task');
        const isLi = block.classList.contains('md-li');

        // Heading: Enter at the start inserts a normal line ABOVE (so you can write a
        // paragraph on top of a heading); anywhere else it ends the heading and continues
        // as a normal paragraph below (a heading never repeats itself).
        if (isHeading) {
          e.preventDefault();
          if (caretAtBlockStart(block)) {
            const plain = document.createElement('div');
            plain.innerHTML = '<br>';
            block.before(plain);
            const r = document.createRange();
            r.setStart(plain, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          } else {
            const range = sel.getRangeAt(0);
            if (!range.collapsed) range.deleteContents();
            const tail = document.createRange();
            tail.setStart(range.startContainer, range.startOffset);
            tail.setEnd(block, block.childNodes.length);
            const frag = tail.extractContents();
            const plain = document.createElement('div');
            plain.appendChild(frag);
            if (plain.childNodes.length === 0) plain.appendChild(document.createElement('br'));
            if (block.childNodes.length === 0) block.appendChild(document.createElement('br'));
            block.after(plain);
            const r = document.createRange();
            r.setStart(plain, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          }
          handleInput();
          requestAnimationFrame(ensureCaretVisible);
          return;
        }

        // Checkbox / bullet: continue the list. The task line is now a plain text block
        // (checkbox is a CSS marker), so this is just a clean block split.
        if (isTask || isLi) {
          e.preventDefault();
          const range = sel.getRangeAt(0);
          if (!range.collapsed) range.deleteContents();
          const tail = document.createRange();
          tail.setStart(range.startContainer, range.startOffset);
          tail.setEnd(block, block.childNodes.length);
          const frag = tail.extractContents();

          const newBlock = document.createElement('div');
          newBlock.className = isTask ? 'md-task' : 'md-li';
          if (isTask) newBlock.setAttribute('data-checked', 'false');
          newBlock.appendChild(frag);
          if (newBlock.childNodes.length === 0) newBlock.appendChild(document.createElement('br'));
          if (block.childNodes.length === 0) block.appendChild(document.createElement('br'));

          block.after(newBlock);
          const r = document.createRange();
          r.setStart(newBlock, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          handleInput();
          requestAnimationFrame(ensureCaretVisible);
          return;
        }
      }

      // Non-list line: a plain block break (new <div>) so lines serialize cleanly.
      e.preventDefault();
      document.execCommand('insertParagraph');
      requestAnimationFrame(ensureCaretVisible);
      return;
    }

    // When the cursor sits inside a <mark>, intercept typed characters and insert
    // them OUTSIDE the mark so new text isn't swallowed into the highlight.
    if (
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
  }, [handleInput, ensureCaretVisible, currentBlock, caretAtBlockStart, convertBlockToPlain]);

  const handleBlur = useCallback(() => {
    onBlur?.();
    setAnchor(null);
  }, [onBlur]);

  // While the highlight strip is open, keep it glued to the selection as the editor
  // scrolls (rAF-throttled) instead of letting it drift or vanish.
  const scrollRaf = useRef<number | null>(null);
  const handleEditorScroll = useCallback(() => {
    if (scrollRaf.current != null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      updatePopover();
    });
  }, [updatePopover]);

  const typeStyle = {
    ...(font ? { fontFamily: font } : {}),
    ...(fontSize ? { fontSize: `${fontSize}px` } : {}),
  };

  return (
    <div className="note-editor">
      {/* The editable stays mounted (just hidden) in preview so its content is preserved
          and ready the moment the user switches back to edit. */}
      <div
        ref={editorRef}
        className="note-editable"
        contentEditable={!previewMode}
        onInput={() => {
          setAnchor(null);
          handleInput();
        }}
        onMouseUp={updatePopover}
        onMouseDown={() => setAnchor(null)}
        onKeyUp={(e) => { if (e.shiftKey || e.key === 'Shift') updatePopover(); }}
        onScroll={handleEditorScroll}
        onClick={handleClick}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        data-placeholder="Write something..."
        spellCheck={false}
        suppressContentEditableWarning
        style={{ ...typeStyle, ...(previewMode ? { display: 'none' } : {}) }}
      />
      {previewMode && (
        <div
          className="note-editable note-preview"
          style={typeStyle}
          dangerouslySetInnerHTML={{ __html: markupToHtml(content) }}
        />
      )}
      {anchor && !previewMode && createPortal(
        <div
          ref={popoverRef}
          className="hl-popover"
          // Positioned/clamped in the useLayoutEffect once measured; hidden until then
          // so it never flashes in the wrong spot.
          style={{ left: 0, top: 0, visibility: 'hidden' }}
          // Keep the editor's text selection alive while the strip is clicked.
          onMouseDown={(e) => e.preventDefault()}
        >
          {HL_ORDER.map((color) => (
            <button
              key={color}
              type="button"
              className="hl-popover-dot"
              style={{ backgroundColor: HL_SWATCH[color] }}
              title={`${color.charAt(0).toUpperCase() + color.slice(1)} highlight`}
              onClick={() => applyHighlight(color)}
            />
          ))}
          <button
            type="button"
            className="hl-popover-eraser"
            title="Remove highlight"
            onClick={removeHighlight}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16.24 3.56l4.2 4.2a1.5 1.5 0 0 1 0 2.12L11 19.31a2 2 0 0 1-2.83 0l-4.2-4.2a1.5 1.5 0 0 1 0-2.12l9.44-9.44a1.5 1.5 0 0 1 2.12 0z" />
              <line x1="4" y1="21" x2="20" y2="21" />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
