import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { EditorView, WidgetType } from '@codemirror/view';

// Pasted images live in an `images` folder next to the notes and are written into the
// note as `![](images/<file>)`, so the note stays plain Markdown (and Obsidian shows it).

declare global {
  interface Window {
    /** Dev-only (src/dev/mockTauri.ts): pasted images kept as data URLs. */
    __pinImages?: Record<string, string>;
  }
}

let dataDir: Promise<string> | null = null;
const getDataDir = () => (dataDir ??= invoke<string>('get_data_dir'));

/** A URL the webview can load for an image path stored in a note. */
export async function imageUrl(path: string): Promise<string> {
  if (/^(https?:|data:|blob:|asset:)/.test(path)) return path;
  const dev = window.__pinImages?.[path];
  if (dev) return dev;
  const dir = await getDataDir();
  return convertFileSrc(await join(dir, ...path.split('/')));
}

// Pictures as data: URLs, kept ready for copy (the clipboard must be filled instantly)
// and for web-page exports.
const dataCache = new Map<string, string>();

/** A picture as a data: URL (cached after the first read). */
export async function imageDataUrl(path: string): Promise<string> {
  const hit = dataCache.get(path) ?? window.__pinImages?.[path];
  if (hit) return hit;
  const url = await invoke<string>('read_image', { path });
  dataCache.set(path, url);
  return url;
}

/** The cached data: URL for a picture, if it has been read already. */
export function cachedImageData(path: string): string | undefined {
  return dataCache.get(path) ?? window.__pinImages?.[path];
}

/** `![alt](path)` at the start of `text`, or null. */
export function parseImage(text: string): { alt: string; path: string } | null {
  const m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(text);
  return m ? { alt: m[1], path: m[2] } : null;
}

export class ImageWidget extends WidgetType {
  constructor(readonly path: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget) {
    return other.path === this.path && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image';
    const img = document.createElement('img');
    img.alt = this.alt || 'Image';
    img.draggable = false;
    // Re-measure once the picture has a size, so the caret and scrolling stay right.
    img.onload = () => view.requestMeasure();
    img.onerror = () => wrap.classList.add('cm-image-missing');
    imageUrl(this.path)
      .then((url) => (img.src = url))
      .catch(() => wrap.classList.add('cm-image-missing'));
    // Have it ready for copy with pictures.
    if (this.path.startsWith('images/')) void imageDataUrl(this.path).catch(() => {});
    wrap.appendChild(img);
    return wrap;
  }
  get estimatedHeight() {
    return 160;
  }
  ignoreEvent() {
    return false;
  }
}

/** Save an image file and put it in the note at the caret, on its own line. */
export async function insertImage(view: EditorView, file: Blob): Promise<void> {
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'png');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = await invoke<string>('save_image', bytes, { headers: { 'x-ext': ext } });
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const insert = `${from > line.from ? '\n' : ''}![](${path})\n`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
  } catch (err) {
    console.error('[Pin Notes] Could not paste the image:', err);
  }
}

/**
 * Ctrl+V / Cmd+V with an image on the clipboard (a screenshot, or "Copy image")
 * inserts the picture, like in a Word document. Pasting text works as before.
 */
export const pasteImages = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData;
    if (!data) return false;
    const item = Array.from(data.items).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    // Office apps put a picture of the text next to the text itself: keep the text.
    if (!item || data.getData('text/plain').trim()) return false;
    const file = item.getAsFile();
    if (!file) return false;
    event.preventDefault();
    if (!view.state.readOnly) void insertImage(view, file);
    return true;
  },
});
