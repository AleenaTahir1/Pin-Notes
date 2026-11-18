import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { EditorView } from '@codemirror/view';
import { cachedImageData, imageDataUrl } from './images';

// Save as (Markdown / plain text / web page) and copying with pictures. All of them start
// from the note's Markdown; pictures are `![](images/<file>)`.

export type ExportFormat = 'md' | 'txt' | 'html';

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Image paths a piece of note text uses. */
export function imagePaths(md: string): string[] {
  return [...new Set([...md.matchAll(IMAGE_RE)].map((m) => m[2]).filter((p) => p.startsWith('images/')))];
}

/** First non-empty line, without Markdown, as a file name / page title. */
export function noteTitle(md: string): string {
  const line = md.replace(IMAGE_RE, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const clean = stripInline(line.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+(\[[ xX]\]\s*)?/, ''))
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .slice(0, 60);
  return clean || 'Pin Note';
}

function stripInline(s: string): string {
  return s
    .replace(/==\{\w+\}/g, '')
    .replace(/==/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Plain text: no Markdown marks; checkboxes as [ ] / [x]; pictures as [Image]. */
export function noteToText(md: string): string {
  return md
    .split('\n')
    .map((line) => {
      let l = line.replace(IMAGE_RE, (_m, alt) => `[Image${alt ? `: ${alt}` : ''}]`);
      l = l.replace(/^(\s*)[-*+]\s*\[([ xX])\]\s?/, (_m, ind, c) => `${ind}[${c.trim() ? 'x' : ' '}] `);
      l = l.replace(/^(\s*)[-*+]\s+/, '$1• ');
      l = l.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '');
      return stripInline(l);
    })
    .join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HL: Record<string, string> = {
  yellow: '#fff59d',
  pink: '#f8bbd9',
  green: '#c8e6c9',
  blue: '#bbdefb',
  purple: '#e1bee7',
};

function inlineHtml(s: string, imgSrc: (path: string) => string): string {
  const parts: string[] = [];
  let last = 0;
  // pictures first, so their paths are never touched by the text formatting below
  for (const m of s.matchAll(IMAGE_RE)) {
    parts.push(formatText(s.slice(last, m.index)));
    parts.push(`<img src="${esc(imgSrc(m[2]))}" alt="${esc(m[1] || 'Image')}">`);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(formatText(s.slice(last)));
  return parts.join('');
}

function formatText(raw: string): string {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/==(?:\{(\w+)\})?([^=\s](?:[^=]*?[^=\s])?)==/g, (_m, c, t) => `<mark style="background:${HL[c] ?? HL.yellow}">${t}</mark>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s;
}

/** The note's body as HTML (headings, lists, checkboxes, quotes, highlights, pictures). */
export function noteBodyHtml(md: string, imgSrc: (path: string) => string): string {
  const out: string[] = [];
  let list: 'ul' | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of md.split('\n')) {
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const task = /^\s*[-*+]\s*\[([ xX])\]\s?(.*)$/.exec(line);
    const li = /^\s*[-*+]\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (task || li) {
      if (!list) out.push((list = 'ul') && '<ul>');
      out.push(
        task
          ? `<li class="task">${task[1].trim() ? '☑' : '☐'} ${task[1].trim() ? `<s>${inlineHtml(task[2], imgSrc)}</s>` : inlineHtml(task[2], imgSrc)}</li>`
          : `<li>${inlineHtml(li![1], imgSrc)}</li>`,
      );
      continue;
    }
    close();
    if (h) out.push(`<h${h[1].length}>${inlineHtml(h[2], imgSrc)}</h${h[1].length}>`);
    else if (q) out.push(`<blockquote>${inlineHtml(q[1], imgSrc)}</blockquote>`);
    else if (line.trim() === '') out.push('<br>');
    else out.push(`<p>${inlineHtml(line, imgSrc)}</p>`);
  }
  close();
  return out.join('\n');
}

/** A complete, self-contained web page for the note (pictures embedded). */
export function noteToHtmlPage(md: string, imgSrc: (path: string) => string, color = '#fff9c4'): string {
  const title = esc(noteTitle(md));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0; background: #f4f1ea; font: 17px/1.6 "Segoe UI", system-ui, -apple-system, sans-serif; color: #2a2520; }
  .note { max-width: 760px; margin: 40px auto; padding: 32px 40px; background: ${color}; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.12); }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: .6em 0 .3em; }
  p { margin: .2em 0; }
  ul { padding-left: 1.4em; margin: .3em 0; }
  li.task { list-style: none; margin-left: -1.4em; }
  li.task s { opacity: .6; }
  blockquote { margin: .4em 0; padding-left: 12px; border-left: 3px solid rgba(0,0,0,.25); font-style: italic; }
  code { font-family: ui-monospace, "Cascadia Code", Menlo, monospace; font-size: .9em; background: rgba(0,0,0,.07); padding: 0 4px; border-radius: 4px; }
  mark { padding: 0 2px; border-radius: 3px; }
  img { max-width: 100%; border-radius: 8px; display: block; margin: 8px 0; box-shadow: 0 2px 10px rgba(0,0,0,.14); }
  footer { max-width: 760px; margin: -20px auto 40px; text-align: right; font-size: 12px; color: #9a9184; }
</style>
</head>
<body>
<main class="note">
${noteBodyHtml(md, imgSrc)}
</main>
<footer>Saved from Pin Notes</footer>
</body>
</html>
`;
}

/** The Markdown file's picture folder: "<title>-images" (no spaces, safe for links). */
export function imagesFolderFor(fileName: string): string {
  return `${fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'note'}-images`;
}

const FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  md: { name: 'Markdown', extensions: ['md'] },
  txt: { name: 'Plain text', extensions: ['txt'] },
  html: { name: 'Web page', extensions: ['html'] },
};

/** Ask where to save, then write the note in the chosen format. Returns the file name, or null if cancelled. */
export async function saveNoteAs(md: string, format: ExportFormat, color?: string): Promise<string | null> {
  const path = await save({
    defaultPath: `${noteTitle(md)}.${format}`,
    filters: [FILTERS[format]],
  });
  if (!path) return null;
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const images = imagePaths(md);
  let contents: string;
  let imagesFolder: string | null = null;
  if (format === 'md') {
    imagesFolder = images.length ? imagesFolderFor(fileName) : null;
    contents = imagesFolder ? md.replace(/\]\(images\//g, `](${imagesFolder}/`) : md;
  } else if (format === 'txt') {
    contents = noteToText(md);
  } else {
    const data: Record<string, string> = {};
    await Promise.all(images.map(async (p) => (data[p] = await imageDataUrl(p).catch(() => ''))));
    contents = noteToHtmlPage(md, (p) => data[p] ?? p, color);
  }
  await invoke('export_note', { path, contents, imagesFolder, images });
  return fileName;
}

/**
 * Copy / cut with pictures: when the selection includes a picture, the clipboard gets
 * the Markdown (for pasting back into Pin Notes) plus HTML with the pictures inside, so
 * Word, Google Docs, email and similar paste the text and the images together.
 */
export const copyWithImages = EditorView.domEventHandlers({
  copy: (event, view) => putOnClipboard(event, view, false),
  cut: (event, view) => putOnClipboard(event, view, true),
});

function putOnClipboard(event: ClipboardEvent, view: EditorView, cut: boolean): boolean {
  const ranges = view.state.selection.ranges.filter((r) => !r.empty);
  if (!ranges.length || !event.clipboardData) return false;
  const text = ranges.map((r) => view.state.sliceDoc(r.from, r.to)).join('\n');
  if (!imagePaths(text).length) return false;
  event.preventDefault();
  event.clipboardData.setData('text/plain', text);
  event.clipboardData.setData('text/html', `<meta charset="utf-8">${noteBodyHtml(text, (p) => cachedImageData(p) ?? p)}`);
  if (cut && !view.state.readOnly) {
    view.dispatch({ changes: ranges.map((r) => ({ from: r.from, to: r.to })), userEvent: 'delete.cut' });
  }
  return true;
}
