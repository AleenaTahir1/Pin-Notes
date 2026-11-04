import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compartment, EditorState, TransactionSpec } from '@codemirror/state';
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlighterColor } from '../types';
import { noteMarkdown } from '../editor/markdown';
import { livePreview, previewFacet } from '../editor/livePreview';
import { applyHighlight, removeHighlight } from '../editor/highlight';

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

// Keep a little room under the caret so a new line never sits flush on the bottom edge.
const scrollRoom = EditorView.scrollMargins.of(() => ({ top: 8, bottom: 28 }));

/**
 * The note editor. The document is the stored markdown itself (no HTML conversion),
 * so what you type is exactly what is saved. CodeMirror handles the caret, scrolling,
 * undo/redo and IME input; livePreview hides the markdown markers.
 */
export function NoteEditor({
  content,
  onContentChange,
  onBlur,
  font,
  fontSize,
  previewMode = false,
}: NoteEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const modeRef = useRef(new Compartment());
  // The latest text we emitted, so our own echo back through props isn't re-applied.
  const emitted = useRef(content);
  const onChangeRef = useRef(onContentChange);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onContentChange;
  onBlurRef.current = onBlur;

  // Floating highlight strip — only shown while text is selected. Rendered through a
  // portal to <body> with viewport (fixed) coords so the note's overflow:hidden can't
  // clip it; positioned and clamped after it is measured.
  const [anchor, setAnchor] = useState<{ cx: number; top: number; bottom: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updatePopover = (view: EditorView) => {
      const sel = view.state.selection.main;
      if (sel.empty || !view.hasFocus || view.state.facet(previewFacet)) {
        setAnchor(null);
        return;
      }
      const a = view.coordsAtPos(sel.from);
      const b = view.coordsAtPos(sel.to);
      if (!a || !b) {
        setAnchor(null);
        return;
      }
      const sameLine = Math.abs(a.top - b.top) < 2;
      const box = view.scrollDOM.getBoundingClientRect();
      setAnchor({
        cx: sameLine ? (a.left + b.right) / 2 : box.left + box.width / 2,
        top: Math.min(a.top, b.top),
        bottom: Math.max(a.bottom, b.bottom),
      });
    };

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          noteMarkdown(),
          livePreview,
          scrollRoom,
          placeholder('Write something...'),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', 'aria-label': 'Note text' }),
          modeRef.current.of([previewFacet.of(false), EditorView.editable.of(true)]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const text = u.state.doc.toString();
              emitted.current = text;
              onChangeRef.current(text);
            }
            if (u.selectionSet || u.focusChanged || u.geometryChanged || u.docChanged) updatePopover(u.view);
            if (u.focusChanged && !u.view.hasFocus) onBlurRef.current?.();
          }),
          EditorView.domEventHandlers({
            scroll: (_e, v) => {
              if (!v.state.selection.main.empty) updatePopover(v);
            },
          }),
        ],
      }),
    });
    viewRef.current = view;

    // Open with the caret at the end, ready to keep writing.
    view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; later content changes come through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External changes (e.g. an edit pulled in from Obsidian): replace the document,
  // keeping the caret where it was as far as possible.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || content === emitted.current) return;
    emitted.current = content;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      selection: { anchor: Math.min(view.state.selection.main.head, content.length) },
    });
  }, [content]);

  // Preview: read-only with every marker hidden.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: modeRef.current.reconfigure([previewFacet.of(previewMode), EditorView.editable.of(!previewMode)]),
    });
    if (previewMode) setAnchor(null);
  }, [previewMode]);

  // Re-measure after font changes so the caret and wrapping stay in sync.
  useEffect(() => {
    viewRef.current?.requestMeasure();
  }, [font, fontSize]);

  // Position the strip after it's measured: prefer above the selection, fall back to
  // below, and clamp inside the window on every edge so it's never clipped.
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

  const run = (make: (s: EditorState) => TransactionSpec | null) => {
    const view = viewRef.current;
    if (!view) return;
    const spec = make(view.state);
    if (spec) view.dispatch(spec);
    setAnchor(null);
    view.focus();
  };

  const typeStyle = {
    ...(font ? { '--editor-font': font } : {}),
    ...(fontSize ? { '--editor-size': `${fontSize}px` } : {}),
  } as React.CSSProperties;

  return (
    <div className={`note-editor ${previewMode ? 'is-preview' : ''}`} style={typeStyle} ref={hostRef}>
      {anchor && !previewMode && createPortal(
        <div
          ref={popoverRef}
          className="hl-popover"
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
              onClick={() => run((s) => applyHighlight(s, color))}
            />
          ))}
          <button
            type="button"
            className="hl-popover-eraser"
            title="Remove highlight"
            onClick={() => run(removeHighlight)}
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
