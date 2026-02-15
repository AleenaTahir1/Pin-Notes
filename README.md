# Pin Notes

A fast, lightweight floating sticky notes app for Windows. No Microsoft account required. No cloud sync. Just instant notes.

## Features

- **Global Hotkey**: Press `Alt+Ctrl+N` anywhere to create a new note
- **Always-on-Top**: Notes float above all other windows
- **Markdown Support**: Write in Markdown, preview with live rendering
- **Color-Coded Notes**: 6 beautiful pastel colors to organize your notes
- **Auto-Save**: Notes are automatically saved to disk
- **System Tray**: Quick access from the system tray
- **Lightweight**: Built with Tauri, uses minimal resources

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Ctrl+N` | Create new note (global) |
| `Ctrl+E` | Toggle edit/preview mode |
| `Ctrl+W` | Close note |
| `Escape` | Close note |

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Project Structure

```
pin-notes/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── store/              # Zustand state management
│   ├── styles/             # CSS styles
│   └── types.ts            # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands.rs     # Tauri IPC commands
│   │   ├── storage.rs      # Note persistence
│   │   ├── hotkey.rs       # Global shortcut
│   │   ├── window.rs       # Window management
│   │   └── tray.rs         # System tray
│   └── tauri.conf.json     # Tauri config
└── package.json
```

## Data Storage

Notes are stored locally at:
- Windows: `%APPDATA%\com.pinnotes.Pin Notes\data\notes.json`

## Tech Stack

- **Frontend**: React, TypeScript, Zustand, Framer Motion
- **Backend**: Rust, Tauri 2.0
- **Styling**: Custom CSS with CSS variables

## License

MIT
