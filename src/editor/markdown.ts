import {
  markdown,
  markdownLanguage,
  insertNewlineContinueMarkupCommand,
  deleteMarkupBackward,
} from '@codemirror/lang-markdown';
import { EditorState, Prec, StateCommand } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { MarkdownConfig } from '@lezer/markdown';

// `==text==` / `=={pink}text==` highlights, parsed like ~~strikethrough~~ so the same
// flanking rules apply: `a == b` is NOT a highlight (spaces on both sides of the `==`).
const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };
const Punctuation = /[!-/:-@[-`{-~¡‐-‧]/;

const Highlight: MarkdownConfig = {
  defineNodes: ['Highlight', 'HighlightMark'],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        // "==" but not "===" (and not the tail of a longer run)
        if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61 || cx.char(pos - 1) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = Punctuation.test(before);
        const pAfter = Punctuation.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: 'Emphasis',
    },
  ],
};

// Sticky notes are plain writing first: leading spaces stay plain text (no indented
// code blocks), `<b>` stays literal, and a "-" typed under a line starts a bullet
// instead of turning the line above into a heading (setext).
const PlainWriting: MarkdownConfig = {
  remove: ['IndentedCode', 'SetextHeading', 'HTMLBlock', 'HTMLTag'],
};

// Enter on a line that is only a marker ("- ", "- [ ] ", "1. ", "> ") leaves the list
// or quote, like Notepad-style apps, instead of continuing it.
export const exitEmptyItem: StateCommand = ({ state, dispatch }) => {
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to || !/^\s*([-*+]( \[[ xX]\])?|\d+[.)]|>)\s*$/.test(line.text)) return false;
  dispatch(state.update({ changes: { from: line.from, to: line.to }, userEvent: 'delete' }));
  return true;
};

const noteKeymap = Prec.high(
  keymap.of([
    { key: 'Enter', run: (v) => exitEmptyItem(v) || insertNewlineContinueMarkupCommand({ nonTightLists: false })(v) },
    { key: 'Backspace', run: deleteMarkupBackward },
  ]),
);

// The shorthand "-[ ]" becomes a real checkbox "- [ ]" as soon as it is typed.
const taskShorthand = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('input')) return tr;
  const line = tr.newDoc.lineAt(tr.newSelection.main.head);
  const m = /^(\s*[-*+])\[[ xX]\]/.exec(line.text);
  if (!m) return tr;
  return [tr, { changes: { from: line.from + m[1].length, insert: ' ' }, sequential: true }];
});

export const noteMarkdown = () => [
  taskShorthand,
  markdown({ base: markdownLanguage, extensions: [Highlight, PlainWriting], addKeymap: false }),
  noteKeymap,
];
