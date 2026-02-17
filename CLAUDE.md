# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install              # Install frontend dependencies
npm run tauri dev        # Run app in development mode (Vite + Tauri with hot reload)
npm run tauri build      # Build production executable
npm run build            # TypeScript check + Vite build (frontend only)
```

Rust backend builds automatically as part of `tauri dev` / `tauri build`. Prerequisites: Node.js v18+, Rust toolchain.

## Architecture

PinNotes is a Windows sticky notes app built with **Tauri 2.0** (Rust backend + React frontend).

### Frontend (`src/`)
- **React 19 + TypeScript** with **Zustand** for state management
- `App.tsx` routes between `NoteWindow` (individual note) and `NotesList` (all notes view) based on URL params
- `store/noteStore.ts` — Zustand store with async actions that call Tauri IPC commands via `invoke()`
- `types.ts` — shared interfaces (`Note`), color constants (`NOTE_COLORS`, `HIGHLIGHTER_COLORS`)
- Content autosave uses 500ms debounce before persisting

### Backend (`src-tauri/src/`)
- `lib.rs` — Tauri app setup, plugin registration, event handlers
- `commands.rs` — IPC command handlers (`create_note`, `update_note`, `delete_note`, `get_notes`, etc.)
- `storage.rs` — JSON file persistence with `Mutex<NotesStorage>` managed state
- `window.rs` — Creates frameless, transparent, always-on-top windows for notes and the notes list
- `hotkey.rs` — Global shortcut registration (Alt+Shift+N)
- `tray.rs` — System tray with menu (New Note, Notes List, Show All, Quit)

### Data Flow
React components → Zustand store → `invoke()` IPC → Rust commands → `NotesStorage` (Mutex) → `notes.json` file

Data stored at: `%APPDATA%\com.pinnotes.Pin Notes\data\notes.json`

### Key Libraries
- **Framer Motion** — flip animations between edit/preview, entrance animations, modal transitions
- **react-markdown** — markdown rendering with custom highlight syntax (`==text==`)
- **tauri-plugin-global-shortcut** — system-wide hotkey
- **tauri-plugin-positioner** — window positioning

## Conventions

- Rust commands: `snake_case` (e.g., `create_note`)
- React components: `PascalCase` (e.g., `NoteWindow`)
- CSS classes: `kebab-case` (e.g., `note-window`)
- Frontend errors logged with `[Pin Notes]` prefix
- Rust errors propagated as `Result<T, String>`
