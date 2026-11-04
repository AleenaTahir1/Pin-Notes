# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install              # Install frontend dependencies
npm run tauri dev        # Run app in development mode (Vite + Tauri with hot reload)
npm run tauri build      # Build production executable
npm run build            # TypeScript check + Vite build (frontend only)
npm test                 # Frontend unit tests (vitest + jsdom)
cd src-tauri && cargo test   # Rust tests (storage, sync)
```

Rust backend builds automatically as part of `tauri dev` / `tauri build`. Prerequisites: Node.js v18+, Rust toolchain.

## Architecture

PinNotes is a Windows sticky notes app built with **Tauri 2.0** (Rust backend + React frontend).

### Frontend (`src/`)
- **React 19 + TypeScript** with **Zustand** for state management
- `App.tsx` routes between `NoteWindow` (individual note) and `NotesList` (all notes view) based on URL params
- `store/noteStore.ts` — Zustand store with async actions that call Tauri IPC commands via `invoke()`
- `components/NoteEditor.tsx` — CodeMirror 6 editor. The document IS the stored markdown (no HTML conversion)
- `editor/markdown.ts` — markdown language config: `==highlight==` / `=={color}…==` parser extension, removed CommonMark rules (indented code, setext headings, HTML), Enter/Backspace keymap
- `editor/livePreview.ts` — Obsidian-style decorations: hides markers (shown faintly on the active line), checkbox and bullet widgets, heading/quote line classes
- `editor/highlight.ts` — apply/remove highlight transactions for the selection strip
- `dev/mockTauri.ts` — in-memory fake backend so `npm run dev` works in a plain browser
- `types.ts` — shared interfaces (`Note`), color constants (`NOTE_COLORS`, `HIGHLIGHTER_COLORS`)
- Content is sent to the backend 150ms after typing pauses; the backend only updates memory

### Backend (`src-tauri/src/`)
- `lib.rs` — Tauri app setup, plugin registration, event handlers
- `commands.rs` — IPC command handlers (`create_note`, `update_note`, `delete_note`, `get_notes`, etc.)
- `storage.rs` — notes in memory (`Mutex`), flushed to disk by a background writer every 400ms (atomic temp-file + rename, previous file kept as `.bak`, damaged files moved aside and the `.bak` used). `update_note` only takes window-owned fields (content, color, font, size); position/visibility/pin/on-top are app-owned
- `window.rs` — Creates frameless, transparent windows for notes (skip taskbar, per-note always-on-top, position tracked on move, pulled back on-screen) and the notes list; new notes spawn near the cursor
- `sync.rs` — two-way Obsidian vault sync (`.md` files with front-matter)
- `hotkey.rs` — Global shortcut registration (Ctrl+Alt+P = new note, Ctrl+Alt+L = notes list)
- `tray.rs` — System tray with menu (New Note, Notes List, Show All, Quit)

### Data Flow
React components → Zustand store → `invoke()` IPC → Rust commands → `NotesStorage` (memory) → background writer → `notes.json` (+ Obsidian mirror, `notes-changed` event to the list)

Data stored at: `%APPDATA%\pinnotes\Pin Notes\data\notes.json` (Windows), `~/Library/Application Support/com.pinnotes.Pin-Notes/notes.json` (macOS). Override with `PIN_NOTES_DATA_DIR` for test runs.

### Key Libraries
- **CodeMirror 6** (`@codemirror/*`, `@lezer/markdown`) — the note editor
- **Framer Motion** — entrance animations, modal transitions (keep note windows 2D: 3D transforms blur text in WebView2)
- **@fontsource** — Caveat / Patrick Hand bundled locally (no Google Fonts fetch)
- **tauri-plugin-global-shortcut** — system-wide hotkey
- **tauri-plugin-positioner** — window positioning

## Conventions

- Rust commands: `snake_case` (e.g., `create_note`)
- React components: `PascalCase` (e.g., `NoteWindow`)
- CSS classes: `kebab-case` (e.g., `note-window`)
- Frontend errors logged with `[Pin Notes]` prefix
- Rust errors propagated as `Result<T, String>`

## Releases

Every push to `main` runs `.github/workflows/release.yml`, which bumps the version and publishes an update that the in-app updater installs for all users. Work on a branch; only push/merge to `main` when you mean to ship.
