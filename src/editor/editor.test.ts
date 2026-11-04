// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { insertNewlineContinueMarkupCommand, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { undo, history, insertNewlineAndIndent } from '@codemirror/commands';
import type { StateCommand } from '@codemirror/state';
import { noteMarkdown, exitEmptyItem } from './markdown';

// What the Enter key runs in the app (note keymap, then the default newline).
const insertNewlineContinueMarkup: StateCommand = (t) =>
  exitEmptyItem(t) || insertNewlineContinueMarkupCommand({ nonTightLists: false })(t) || insertNewlineAndIndent(t);
import { livePreview, previewFacet, toggleTaskAt } from './livePreview';
import { applyHighlight, removeHighlight } from './highlight';
import { normalizeTaskShorthand, hasMarkdown, stepFontSize, toDarkPastel, isDarkColor, applyTemplatePlaceholders } from '../types';

const stateOf = (doc: string, anchor = doc.length, head = anchor) =>
  EditorState.create({ doc, selection: EditorSelection.single(anchor, head), extensions: [noteMarkdown(), history()] });

function nodes(doc: string): string[] {
  const s = stateOf(doc);
  ensureSyntaxTree(s, s.doc.length, 1000);
  const out: string[] = [];
  syntaxTree(s).iterate({ enter: (n) => void out.push(n.name) });
  return out;
}

// Run a StateCommand and return the resulting document + caret.
function cmd(doc: string, pos: number, command: typeof insertNewlineContinueMarkup) {
  let state = stateOf(doc, pos);
  command({ state, dispatch: (tr) => (state = tr.state) });
  return { doc: state.doc.toString(), caret: state.selection.main.head };
}

describe('parsing (what gets styled)', () => {
  it('colored and plain highlights', () => {
    expect(nodes('=={pink}hi==')).toContain('Highlight');
    expect(nodes('==hi==')).toContain('Highlight');
  });
  it('plain "==" in text is not a highlight', () => {
    expect(nodes('if a == b and c == d')).not.toContain('Highlight');
  });
  it('maths with spaced asterisks is not italic', () => {
    expect(nodes('2 * 3 * 4')).not.toContain('Emphasis');
  });
  it('asterisks inside inline code are not formatted', () => {
    expect(nodes('`a*b*c`')).not.toContain('Emphasis');
  });
  it('tasks, bullets, headings, quotes, strike', () => {
    const n = nodes('# H\n- [ ] t\n- b\n> q\n~~s~~');
    for (const name of ['ATXHeading1', 'TaskMarker', 'ListMark', 'Blockquote', 'Strikethrough']) expect(n).toContain(name);
  });
  it('a "-" typed under a line does not turn that line into a heading', () => {
    expect(nodes('Shopping\n- ')).not.toContain('SetextHeading2');
  });
  it('indented text stays plain (no code block)', () => {
    expect(nodes('    indented')).not.toContain('CodeBlock');
  });
});

describe('Enter / Backspace behave like a notes app', () => {
  it('Enter at end of a checkbox continues the list and puts the caret on the new item', () => {
    const doc = '# To-do\n- [ ] milk\n- [ ] eggs';
    const r = cmd(doc, doc.length, insertNewlineContinueMarkup);
    expect(r.doc).toBe('# To-do\n- [ ] milk\n- [ ] eggs\n- [ ] ');
    expect(r.caret).toBe(r.doc.length);
  });
  it('Enter at end of a bullet continues the list', () => {
    const r = cmd('- one', 5, insertNewlineContinueMarkup);
    expect(r.doc).toBe('- one\n- ');
  });
  it('Enter on an empty bullet or checkbox leaves the list', () => {
    expect(cmd('- one\n- ', 8, insertNewlineContinueMarkup).doc).toBe('- one\n');
    expect(cmd('- [ ] a\n- [ ] ', 14, insertNewlineContinueMarkup).doc).toBe('- [ ] a\n');
    expect(cmd('text\n- ', 7, insertNewlineContinueMarkup).doc).toBe('text\n');
  });
  it('Enter at end of a heading starts a plain line', () => {
    const r = cmd('# Groceries', 11, insertNewlineContinueMarkup);
    expect(r.doc).toBe('# Groceries\n');
  });
  it('Enter in the middle of a checked task starts an unchecked one', () => {
    const r = cmd('- [x] bread and milk', 12, insertNewlineContinueMarkup);
    expect(r.doc).toBe('- [x] bread\n- [ ] and milk');
  });
  it('Backspace right after a bullet marker removes the marker', () => {
    const r = cmd('- item', 2, deleteMarkupBackward);
    expect(r.doc).toBe('item');
  });
  it('undo reverts list continuation', () => {
    let state = stateOf('- a', 3);
    insertNewlineContinueMarkup({ state, dispatch: (tr) => (state = tr.state) });
    expect(state.doc.toString()).toBe('- a\n- ');
    undo({ state, dispatch: (tr) => (state = tr.state) });
    expect(state.doc.toString()).toBe('- a');
  });
});

describe('highlighting', () => {
  const apply = (doc: string, from: number, to: number, color: 'pink' | 'yellow' = 'pink') => {
    const s = stateOf(doc, from, to);
    const spec = applyHighlight(s, color);
    return spec ? s.update(spec).state.doc.toString() : doc;
  };
  it('wraps the selection', () => {
    expect(apply('hello world', 6, 11)).toBe('hello =={pink}world==');
  });
  it('one highlight per line for multi-line selections, ignoring outer spaces', () => {
    expect(apply('one \ntwo', 0, 8)).toBe('=={pink}one== \n=={pink}two==');
  });
  it('recolors instead of nesting when the selection overlaps a highlight', () => {
    expect(apply('a =={yellow}bc== d', 5, 13)).toBe('a =={pink}bc== d');
  });
  it('empty selection does nothing', () => {
    expect(apply('abc', 1, 1)).toBe('abc');
  });
  it('remove highlight keeps the text', () => {
    const s = stateOf('x =={blue}keep== y', 12);
    const spec = removeHighlight(s)!;
    expect(s.update(spec).state.doc.toString()).toBe('x keep y');
  });
});

describe('live preview view', () => {
  let view: EditorView | null = null;
  afterEach(() => {
    view?.destroy();
    view = null;
  });
  const mount = (doc: string, preview = false) => {
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc, extensions: [noteMarkdown(), livePreview, previewFacet.of(preview)] }),
    });
    return view;
  };

  it('stores exactly what was loaded (no conversion)', () => {
    const tricky = 'if a == b\n2 * 3 * 4\n_soft_\n>\n-[ ] x\n**bold *and italic***\n`a*b*c`\n  indented\n\n\ntrailing\n';
    expect(mount(tricky).state.doc.toString()).toBe(tricky);
  });
  it('draws checkboxes and bullets and hides markers when not editing', () => {
    const v = mount('# Title\n- [ ] milk\n- [x] eggs\n- bread\n**b** =={pink}h==');
    const dom = v.contentDOM;
    expect(dom.querySelectorAll('.cm-task-box').length).toBe(2);
    expect(dom.querySelector('.cm-task-box[data-checked="true"]')).not.toBeNull();
    expect(dom.querySelector('.cm-bullet')).not.toBeNull();
    expect(dom.querySelector('.cm-h1')).not.toBeNull();
    expect(dom.textContent).not.toContain('**');
    expect(dom.textContent).not.toContain('{pink}');
    expect(dom.textContent).not.toContain('# ');
    expect(dom.querySelector('.cm-hl-pink')).not.toBeNull();
  });
  it('clicking a checkbox toggles it in the text', () => {
    const v = mount('- [ ] milk');
    expect(toggleTaskAt(v, 0)).toBe(true);
    expect(v.state.doc.toString()).toBe('- [x] milk');
    toggleTaskAt(v, 3);
    expect(v.state.doc.toString()).toBe('- [ ] milk');
  });
  it('a 3,000-line note loads and stays identical', () => {
    const big = Array.from({ length: 3000 }, (_, i) => (i % 10 ? `line ${i} with **bold** and =={pink}mark==` : `# Heading ${i}`)).join('\n');
    expect(mount(big).state.doc.toString()).toBe(big);
  });
});

describe('checkbox shorthand', () => {
  it('old "-[ ]" notes load as real checkboxes', () => {
    expect(normalizeTaskShorthand('-[ ] a\n  -[x] b\n- [ ] c\ntext -[ ] d')).toBe('- [ ] a\n  - [x] b\n- [ ] c\ntext -[ ] d');
  });
  it('typing "-[ ]" turns into "- [ ]"', () => {
    let state = stateOf('-[ ', 3);
    state = state.update({ changes: { from: 3, insert: ']' }, selection: { anchor: 4 }, userEvent: 'input.type' }).state;
    expect(state.doc.toString()).toBe('- [ ]');
    expect(state.selection.main.head).toBe(5);
  });
});

describe('types helpers', () => {
  it('hasMarkdown', () => {
    expect(hasMarkdown('just text')).toBe(false);
    expect(hasMarkdown('if a == b then c == d')).toBe(false);
    expect(hasMarkdown('# h')).toBe(true);
    expect(hasMarkdown('- [ ] t')).toBe(true);
    expect(hasMarkdown('a **b** c')).toBe(true);
    expect(hasMarkdown('=={pink}x==')).toBe(true);
  });
  it('stepFontSize clamps and steps', () => {
    expect(stepFontSize(18, 1)).toBe(22);
    expect(stepFontSize(18, -1)).toBe(15);
    expect(stepFontSize(32, 1)).toBe(32);
    expect(stepFontSize(13, -1)).toBe(13);
  });
  it('dark pastel stays dark and isDarkColor agrees', () => {
    for (const c of ['#fff9c4', '#eef5ff', '#e1f7f2']) {
      expect(isDarkColor(toDarkPastel(c))).toBe(true);
      expect(isDarkColor(c)).toBe(false);
    }
  });
  it('template placeholders filled', () => {
    expect(applyTemplatePlaceholders('{{date}} {{time}}')).not.toContain('{{');
  });
});
