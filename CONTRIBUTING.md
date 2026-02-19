# Contributing to PinNotes

First off, thank you for considering contributing to PinNotes! It's people like you that make PinNotes such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
A clear description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
 - OS: [e.g., Windows 11]
 - PinNotes Version: [e.g., 0.1.0]
 - Note Count: [e.g., 15 notes]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- Use a clear and descriptive title
- Provide a detailed description of the suggested enhancement
- Explain why this enhancement would be useful
- Include mockups or examples if applicable

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** and ensure they follow our coding style
4. **Test your changes**: `npm run tauri dev`
5. **Update documentation** if needed
6. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Tauri CLI

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/Pin-Notes.git
cd Pin-Notes

# Install dependencies
npm install

# Start development server
npm run tauri dev
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
│   │   └── MarkdownRenderer.tsx   # Markdown preview
│   ├── hooks/              # Custom React hooks
│   ├── store/              # Zustand state management
│   └── styles/             # CSS styles
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

## Coding Guidelines

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Use React hooks for state management

### Rust

- Follow Rust naming conventions
- Use `Result` for error handling
- Document public functions with `///` comments
- Keep functions small and focused

### CSS

- Use Handwriting fonts and Neumorphic design
- Follow the style patterns defined in `src/styles/`
- Use the color palette defined in `types.ts` (`NOTE_COLORS`, `HIGHLIGHTER_COLORS`)
- Maintain the soft, pastel aesthetic across components

### Commits

- Use clear, descriptive commit messages
- Start with a verb: "Add", "Fix", "Update", "Remove"
- Reference issues when applicable: "Fix #123"

**Examples:**
```
Add support for custom note colors
Fix note window dragging on multi-monitor setups
Update highlighter picker UI
Remove deprecated font option
```

## Testing

Before submitting a PR:

1. Ensure the app builds: `npm run build`
2. Test in development: `npm run tauri dev`
3. Test the production build: `npm run tauri build`
4. Test with various note colors, fonts, and highlighter combinations

## Getting Help

- Open an issue for questions
- Join discussions in GitHub Discussions
- Check the README for usage instructions

## Recognition

Contributors will be recognized in:
- The README.md file
- Release notes
- The app's About section

Thank you for contributing to PinNotes!
