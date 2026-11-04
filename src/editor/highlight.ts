import { ensureSyntaxTree } from '@codemirror/language';
import { ChangeSpec, EditorState, TransactionSpec } from '@codemirror/state';
import type { HighlighterColor } from '../types';

interface Span {
  from: number;
  to: number;
}

/** Highlight nodes (`==…==`) that touch [from, to]. */
function highlightsIn(state: EditorState, from: number, to: number): Span[] {
  const tree = ensureSyntaxTree(state, to, 500);
  const out: Span[] = [];
  tree?.iterate({
    from,
    to,
    enter: (n) => {
      if (n.name === 'Highlight') out.push({ from: n.from, to: n.to });
    },
  });
  return out;
}

const stripMarks = (s: string) => s.replace(/==(\{\w+\})?/g, '');

/**
 * Wrap the selection in a highlight of `color`. Multi-line selections get one highlight
 * per line, and existing highlights the selection overlaps are replaced, not nested.
 */
export function applyHighlight(state: EditorState, color: HighlighterColor): TransactionSpec | null {
  const sel = state.selection.main;
  if (sel.empty) return null;
  const changes: ChangeSpec[] = [];
  const first = state.doc.lineAt(sel.from).number;
  const last = state.doc.lineAt(sel.to).number;
  let end = sel.to;
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    let from = Math.max(sel.from, line.from);
    let to = Math.min(sel.to, line.to);
    // Grow over any highlight we cut into so its markers are removed cleanly.
    for (const h of highlightsIn(state, from, to)) {
      if (h.to <= line.from || h.from >= line.to) continue;
      from = Math.min(from, h.from);
      to = Math.max(to, h.to);
    }
    const raw = state.sliceDoc(from, to);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const inner = stripMarks(raw.trim());
    if (!inner) continue;
    const insert = `=={${color}}${inner}==`;
    changes.push({ from: from + lead, to: to - trail, insert });
    if (n === last) end = from + lead + insert.length;
  }
  if (!changes.length) return null;
  return { changes, selection: { anchor: end }, userEvent: 'input.highlight' };
}

/** Remove every highlight the selection (or the cursor) touches, keeping the text. */
export function removeHighlight(state: EditorState): TransactionSpec | null {
  const sel = state.selection.main;
  const spans = highlightsIn(state, sel.from, sel.to).filter((h) => h.from <= sel.to && h.to >= sel.from);
  if (!spans.length) return null;
  const changes: ChangeSpec[] = [];
  for (const h of spans) {
    const tag = /^==(\{\w+\})?/.exec(state.sliceDoc(h.from, h.from + 24));
    changes.push({ from: h.from, to: h.from + (tag ? tag[0].length : 2) });
    changes.push({ from: h.to - 2, to: h.to });
  }
  return { changes, userEvent: 'delete.highlight' };
}
