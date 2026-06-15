# Pin Notes ↔ Obsidian (two-way sync)

Pin Notes can sync your notes **both ways** with an Obsidian vault. Edit a note in
Pin Notes and the matching `.md` updates; edit that `.md` in Obsidian and the change
flows back into Pin Notes. Implemented in `src-tauri/src/sync.rs` + `settings.rs`.

## How to use it

1. Open the **Notes list** (left-click the tray icon).
2. Click the **Obsidian** button (the chain/link icon) in the header.
3. Pick your vault folder. **Tip:** choose a *subfolder* of your vault, e.g.
   `YourVault\PinNotes`, so Pin Notes' files stay tidy and separate from the rest.
4. Done — the button turns **purple** to show sync is active. A toast confirms how many
   notes synced.

To stop syncing, click the **unlink** button next to it (your `.md` files are kept).
To change folders, click the Obsidian button again and pick a new one.

## Markdown formatting

Notes are plain Markdown, so what you write in Pin Notes reads cleanly in Obsidian and
vice-versa. These all render in Pin Notes **and** round-trip back to your vault:

| Markdown | Result |
|----------|--------|
| `# Heading` … `###### Heading` | Headings **H1–H6** |
| `**bold**` | **bold** |
| `*italic*` or `_italic_` | *italic* |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `` `inline code` `` | `inline code` |
| `> quote` | Blockquote |
| `- item` (or `* item`) | Bullet list |
| `- [ ] todo` / `- [x] done` | Task checkbox — **click the box in the note to tick it** |
| `==text==` | Highlight (see caveat below) |

Type the Markdown in Obsidian and it shows up formatted in Pin Notes after the next sync;
tick a checkbox in Pin Notes and the `- [x]` updates in your `.md`. Underscores inside
words (e.g. `my_file_name`) are left alone, so they won't turn into italics.

> **Note:** a note's **font** and **text size** (the `Aa` and `A− / A+` buttons) are a
> Pin Notes display preference only — they aren't part of Markdown, so they don't appear
> in the `.md` and don't affect Obsidian.

## Templates from your vault

Pin Notes can use your own Obsidian templates:

1. In your connected vault, create a folder named **`Templates`**.
2. Drop any `.md` files into it — each becomes a template.
3. In Pin Notes, click **+** in the notes list → your templates appear under
   **"From your vault"**. Pick one to start a note pre-filled with that content.

`{{date}}` and `{{time}}` placeholders are filled in with the current date/time when the
note is created. The `Templates` folder is **ignored by sync** — those files are sources
for new notes, not notes themselves, so they never turn into sticky notes.

## What syncs, and when

- **Pin Notes → Obsidian:** every edit (typing, color, pin, clear, delete) writes the
  note's `.md` immediately.
- **Obsidian → Pin Notes:** a background reconcile runs every ~3 seconds and pulls in
  any files you changed or created in Obsidian. Open note windows refresh within a
  couple seconds (only while you're *not* actively typing in them, so your input is
  never clobbered).

## File format

One `.md` per note, with YAML front-matter Obsidian shows as **Properties**:

```yaml
---
pin_id: 7c65f1c9-55ad-4f0c-921b-082983ee892c
color: "#fff9c4"
pinned: false
created: 2026-06-11
updated: 2026-06-12
---

your note text
```

- `pin_id` is the stable link between a note and its file — **don't delete it**, or the
  file will be treated as a brand-new note.
- Any **extra** properties you add in Obsidian (tags, aliases, cssclasses…) are
  **preserved** — Pin Notes only rewrites its own five keys.
- New `.md` files you create directly in Obsidian become new Pin Notes automatically
  (Pin Notes stamps a `pin_id` into them on first sync).

## Rules & caveats

- **Conflicts** (same note edited in both places before a sync) resolve **last-write-wins**
  by timestamp.
- **Highlights:** Pin Notes' colored highlights `=={pink}text==` are written as Obsidian's
  standard `==text==`. If you *edit* a highlighted note inside Obsidian, its highlights
  come back as the default **yellow** (Obsidian doesn't carry the color). Untouched notes
  keep their original colors.
- **Deletion is one-way for safety:** deleting a note in Pin Notes deletes its file.
  Deleting a *file* in Obsidian does **not** delete the note — Pin Notes will recreate the
  file on the next sync. To remove a note for good, delete it in Pin Notes.
- **Big vaults:** syncing scans the chosen folder, so pointing it at a subfolder (not a
  huge vault root) keeps it fast.
