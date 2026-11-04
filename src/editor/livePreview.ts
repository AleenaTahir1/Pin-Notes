import { syntaxTree } from '@codemirror/language';
import { EditorState, Facet, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';

// Obsidian-style live preview: the document stays plain markdown, but markers (#, **,
// ==, >, - [ ]) are hidden and the text is styled. Markers reappear on the line being
// edited so formatting can still be changed. In preview mode nothing is revealed.
export const previewFacet = Facet.define<boolean, boolean>({ combine: (v) => v.some(Boolean) });

const HL_COLORS = new Set(['yellow', 'pink', 'green', 'blue', 'purple']);

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-bullet';
    el.textContent = '•';
    return el;
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-task-box';
    el.dataset.checked = String(this.checked);
    el.textContent = this.checked ? '☑' : '☐';
    el.setAttribute('aria-label', this.checked ? 'Done' : 'To do');
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() });
const taskOpen = Decoration.replace({ widget: new TaskWidget(false) });
const taskDone = Decoration.replace({ widget: new TaskWidget(true) });
const hidden = Decoration.replace({});
const dimMark = Decoration.mark({ class: 'cm-md-mark' });
const lineClass = (cls: string) => Decoration.line({ class: cls });
const strong = Decoration.mark({ class: 'cm-strong' });
const em = Decoration.mark({ class: 'cm-em' });
const strike = Decoration.mark({ class: 'cm-strike' });
const code = Decoration.mark({ class: 'cm-inline-code' });
const hlMarks = new Map<string, Decoration>();
const hl = (color: string) => {
  if (!hlMarks.has(color)) hlMarks.set(color, Decoration.mark({ class: `cm-hl cm-hl-${color}` }));
  return hlMarks.get(color)!;
};

/** Lines that hold a cursor or selection while the editor has focus. */
function activeLines(state: EditorState, focused: boolean): Set<number> {
  const lines = new Set<number>();
  if (!focused) return lines;
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView): { all: DecorationSet; atomic: DecorationSet } {
  const { state } = view;
  const preview = state.facet(previewFacet);
  const active = preview ? new Set<number>() : activeLines(state, view.hasFocus);
  const decos: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const spaceAfter = (pos: number) => (state.sliceDoc(pos, pos + 1) === ' ' ? pos + 1 : pos);
  // Hide a marker, or just dim it when its line is being edited.
  const marker = (from: number, to: number) => {
    if (from >= to) return;
    decos.push((isActive(from) ? dimMark : hidden).range(from, to));
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          decos.push(lineClass(`cm-h${heading[1]}`).range(state.doc.lineAt(node.from).from));
          return;
        }
        switch (name) {
          case 'HeaderMark': {
            const line = state.doc.lineAt(node.from);
            // Opening "# " (closing "##" on the same line is hidden too)
            marker(node.from, node.from === line.from || /^\s*$/.test(state.sliceDoc(line.from, node.from)) ? spaceAfter(node.to) : node.to);
            return;
          }
          case 'Blockquote': {
            let pos = node.from;
            while (pos <= node.to) {
              const line = state.doc.lineAt(pos);
              decos.push(lineClass('cm-quote').range(line.from));
              pos = line.to + 1;
            }
            return;
          }
          case 'QuoteMark':
            marker(node.from, spaceAfter(node.to));
            return;
          case 'ListMark': {
            const text = state.sliceDoc(node.from, node.to);
            if (!/^[-*+]$/.test(text)) return; // ordered lists keep their numbers
            const after = state.sliceDoc(node.to, node.to + 4);
            // Task items are drawn as a checkbox by TaskMarker below.
            if (/^ ?\[[ xX]\]/.test(after)) return;
            const end = spaceAfter(node.to);
            const r = bullet.range(node.from, end);
            decos.push(r);
            atomic.push(r);
            return;
          }
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            const line = state.doc.lineAt(node.from);
            // Swallow the "- " before the box so the line starts with just the checkbox.
            const before = state.sliceDoc(line.from, node.from);
            const m = /^(\s*)[-*+] ?$/.exec(before);
            const start = m ? line.from + m[1].length : node.from;
            const r = (checked ? taskDone : taskOpen).range(start, spaceAfter(node.to));
            decos.push(r);
            atomic.push(r);
            decos.push(lineClass(checked ? 'cm-task cm-task-done' : 'cm-task').range(line.from));
            return;
          }
          case 'StrongEmphasis':
            decos.push(strong.range(node.from, node.to));
            return;
          case 'Emphasis':
            decos.push(em.range(node.from, node.to));
            return;
          case 'Strikethrough':
            decos.push(strike.range(node.from, node.to));
            return;
          case 'InlineCode':
            decos.push(code.range(node.from, node.to));
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'CodeMark':
            if (node.node.parent?.name === 'FencedCode') return;
            marker(node.from, node.to);
            return;
          case 'Highlight': {
            const tag = /^==\{(\w+)\}/.exec(state.sliceDoc(node.from, node.from + 24));
            const color = tag && HL_COLORS.has(tag[1]) ? tag[1] : 'yellow';
            decos.push(hl(color).range(node.from, node.to));
            return;
          }
          case 'HighlightMark': {
            // Opening mark also hides its {color} tag.
            const tag = /^\{\w+\}/.exec(state.sliceDoc(node.to, node.to + 22));
            const isOpen = node.node.parent?.from === node.from;
            marker(node.from, isOpen && tag ? node.to + tag[0].length : node.to);
            return;
          }
          case 'FencedCode': {
            let pos = node.from;
            while (pos <= node.to) {
              const line = state.doc.lineAt(pos);
              decos.push(lineClass('cm-codeblock').range(line.from));
              pos = line.to + 1;
            }
            return;
          }
        }
      },
    });
  }
  return { all: Decoration.set(decos, true), atomic: Decoration.set(atomic, true) };
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      ({ all: this.decorations, atomic: this.atomic } = build(view));
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.focusChanged ||
        syntaxTree(u.state) !== syntaxTree(u.startState) ||
        u.startState.facet(previewFacet) !== u.state.facet(previewFacet)
      ) {
        ({ all: this.decorations, atomic: this.atomic } = build(u.view));
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.atomic ?? Decoration.none),
  },
);

/** Toggle `[ ]` <-> `[x]` on the task line containing `pos`. Returns false if not a task. */
export function toggleTaskAt(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos);
  const m = /^(\s*[-*+] ?\[)([ xX])\]/.exec(line.text);
  if (!m) return false;
  const at = line.from + m[1].length;
  view.dispatch({ changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
  return true;
}

const taskClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    const box = (e.target as HTMLElement).closest('.cm-task-box');
    if (!box) return false;
    e.preventDefault();
    return toggleTaskAt(view, view.posAtDOM(box));
  },
});

export const livePreview = [livePreviewPlugin, taskClicks];
