import { EditorSelection } from '@codemirror/state';
import { EditorView, keymap, Panel, ViewUpdate } from '@codemirror/view';
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { t } from '../store/i18n';

// Find in note: Ctrl+F / Cmd+F (or the magnifier in the title bar) opens a small bar at
// the top of the note. Typing jumps to the first match, Enter / Shift+Enter step through,
// Esc closes. Matches are highlighted in the text.

/** How many matches there are, and which one is selected (1-based, 0 = none). */
export function matchCount(state: EditorView['state']): { total: number; current: number } {
  const q = getSearchQuery(state);
  if (!q.search || !q.valid) return { total: 0, current: 0 };
  const sel = state.selection.main;
  const cursor = q.getCursor(state);
  let total = 0;
  let current = 0;
  for (let r = cursor.next(); !r.done && total < 9999; r = cursor.next()) {
    total++;
    if (r.value.from === sel.from && r.value.to === sel.to) current = total;
  }
  return { total, current };
}

const svg = (paths: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

function button(cls: string, title: string, icon: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `cm-find-btn ${cls}`;
  b.title = title;
  b.innerHTML = icon;
  // Keep focus in the input while stepping through matches.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', onClick);
  return b;
}

function createFindPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-find';

  const glass = document.createElement('span');
  glass.className = 'cm-find-glass';
  glass.innerHTML = svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>');

  const input = document.createElement('input');
  input.className = 'cm-find-input';
  input.type = 'text';
  input.placeholder = t('find.placeholder');
  input.setAttribute('main-field', 'true');
  input.setAttribute('aria-label', t('find.placeholder'));
  input.spellcheck = false;
  input.value = getSearchQuery(view.state).search;

  const count = document.createElement('span');
  count.className = 'cm-find-count';
  count.setAttribute('aria-live', 'polite');

  const renderCount = () => {
    if (!input.value) {
      count.textContent = '';
      dom.classList.remove('cm-find-empty');
      return;
    }
    const { total, current } = matchCount(view.state);
    count.textContent = total ? `${current || '–'} / ${total}` : t('find.noResults');
    dom.classList.toggle('cm-find-empty', total === 0);
  };

  const step = (back: boolean) => {
    if (back) findPrevious(view);
    else findNext(view);
  };

  input.addEventListener('input', () => {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value })) });
    if (input.value) {
      // Like Word: jump to the first match in the note.
      view.dispatch({ selection: EditorSelection.cursor(0) });
      findNext(view);
    }
    renderCount();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  });

  const prev = button('cm-find-prev', t('find.prev'), svg('<path d="M18 15l-6-6-6 6"/>'), () => step(true));
  const next = button('cm-find-next', t('find.next'), svg('<path d="M6 9l6 6 6-6"/>'), () => step(false));
  const close = button('cm-find-close', t('find.close'), svg('<path d="M18 6L6 18M6 6l12 12"/>'), () => {
    closeSearchPanel(view);
    view.focus();
  });

  dom.append(glass, input, count, prev, next, close);
  return {
    dom,
    top: true,
    mount() {
      input.focus();
      input.select();
      renderCount();
    },
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) {
        renderCount();
      }
    },
  };
}

const KEEP = new Set(['Mod-f', 'F3', 'Mod-g', 'Escape']);

export const findInNote = [
  search({
    top: true,
    createPanel: createFindPanel,
    scrollToMatch: (range) => EditorView.scrollIntoView(range, { y: 'center' }),
  }),
  keymap.of(searchKeymap.filter((b) => b.key && KEEP.has(b.key))),
];

/** The title-bar magnifier: open the find bar, or close it if it is open. */
export function toggleFind(view: EditorView) {
  if (searchPanelOpen(view.state)) {
    closeSearchPanel(view);
    view.focus();
  } else {
    openSearchPanel(view);
  }
}
