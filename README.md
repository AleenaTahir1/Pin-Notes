<div align="center">

<img src="src-tauri/icons/128x128.png" alt="PinNotes Logo" width="100" />

# PinNotes

**Floating sticky notes for Windows**

Pin notes to your desktop — always on top, always within reach.

[![Release](https://img.shields.io/github/v/release/AleenaTahir1/Pin-Notes)](https://github.com/AleenaTahir1/Pin-Notes/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/AleenaTahir1/Pin-Notes/ci.yml)](https://github.com/AleenaTahir1/Pin-Notes/actions)
[![License](https://img.shields.io/badge/license-Source%20Available-blue)](LICENSE.txt)

</div>

---

## Screenshots

### Notes List

<p align="center">
  <img src="Screenshots/notes-list.png" alt="PinNotes Notes List" width="280" />
</p>

### Note Window

<p align="center">
  <img src="Screenshots/note-window.png" alt="PinNotes Note Window" width="280" />
</p>

---

## Why PinNotes

You have thoughts, tasks, and quick reminders scattered across apps, browser tabs, and text files. Nothing stays visible. Nothing stays handy.

PinNotes gives you floating sticky notes that pin to your desktop — always on top of other windows. Jot something down, pick a color, and it stays right where you need it. No accounts, no cloud, no clutter.

---

## Features

- **Always on top** — Floating notes that stay visible over all other windows
- **Notes list panel** — Browse, search, and pin-to-top your favorite notes
- **Rich highlighting** — 5 highlighter colors (yellow, pink, green, blue, purple)
- **Multiple note colors** — 8 pastel themes to color-code your notes
- **Font switching** — Choose between Handwriting, Clean, and Mono fonts
- **System tray** — Quick actions from the tray icon (new note, notes list, show all, quit)
- **Global shortcuts** — Create notes and open the list from anywhere on your desktop
- **Auto-save** — Notes save automatically with debounce, no manual saving needed
- **Local storage** — JSON file persistence — no cloud, no account required
- **Frameless windows** — Draggable, borderless windows that feel like real sticky notes
- **Neumorphic design** — Soft, modern UI with subtle depth and shadows

---

## Installation

Download the latest release from the [Releases](https://github.com/AleenaTahir1/Pin-Notes/releases) page:

- **`.msi`** — Standard Windows installer (recommended)
- **`.exe`** — NSIS installer

---

## Usage

### Quick Start

1. **Launch PinNotes** — The app starts in the system tray
2. **Create a note** — Press `Ctrl+Alt+P` or right-click the tray icon
3. **Write anything** — Your note auto-saves as you type
4. **Pick a color** — Click the palette icon to change note color
5. **Highlight text** — Select text and choose a highlighter color

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Alt+P** | Create a new note |
| **Ctrl+Alt+L** | Open notes list |

### System Tray

Right-click the tray icon for quick actions:

| Action | Description |
|--------|-------------|
| **New Note** | Create a new sticky note |
| **Notes List** | Open the notes list panel |
| **Show All** | Bring all notes to the front |
| **Quit** | Close PinNotes |

---

## Development

### Requirements

- Node.js 18+
- Rust 1.70+
- Tauri 2 system dependencies

### Run Locally

```bash
git clone https://github.com/AleenaTahir1/Pin-Notes.git
cd Pin-Notes
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

### Project Structure

```
PinNotes/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI components
│   │   ├── NoteWindow.tsx  # Individual sticky note
│   │   ├── NotesList.tsx   # Notes list panel
│   │   ├── NoteEditor.tsx  # Note content editor
│   │   ├── ColorPicker.tsx # Note color selection
│   │   ├── HighlighterPicker.tsx  # Text highlight colors
│   │   ├── MarkdownRenderer.tsx   # Markdown preview
│   │   ├── DeleteModal.tsx # Delete confirmation
│   │   └── SpiralBinding.tsx      # Decorative spiral
│   ├── hooks/              # Custom React hooks
│   ├── store/              # Zustand state management
│   ├── styles/             # CSS styles
│   └── types.ts            # Shared types and constants
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── lib.rs          # App setup and plugin registration
│       ├── commands.rs     # Tauri IPC command handlers
│       ├── storage.rs      # JSON file persistence
│       ├── window.rs       # Frameless window creation
│       ├── hotkey.rs       # Global shortcut registration
│       └── tray.rs         # System tray menu
└── package.json
```

---

## Tech Stack

- **Frontend** — React 19, TypeScript, Zustand
- **Backend** — Rust, Tauri 2
- **Animations** — Framer Motion
- **Markdown** — react-markdown
- **UI Style** — Neumorphic design
- **Build** — Vite

---

## License

This project uses a **Source Available** license. See [LICENSE.txt](LICENSE.txt) for details.

- Free for personal and educational use
- Free to modify for personal use
- Commercial use requires permission

---

## Author

**Aleena Tahir**

- GitHub: [@AleenaTahir1](https://github.com/AleenaTahir1)
- LinkedIn: [aleenatahir](https://www.linkedin.com/in/aleenatahir/)
