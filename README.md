# Remark

A lightweight, native Markdown editor with live preview and AI formatting via [Ollama](https://ollama.com).

## Features

- **Three views** – Editor, Preview, or side-by-side Split view
- **Syntax highlighting** – Code blocks in 190+ languages via highlight.js
- **Auto-save** – Configurable interval (default: 2s)
- **File integration** – Double-click `.md` files, drag & drop
- **Dark/Light theme** – Warm, creamy design
- **AI formatting** – Format Markdown with a local Ollama model
- **First-run wizard** – Download, install Ollama and pull a model automatically
- **Find/Search** – Full-text search in editor (Ctrl+F)

## Quick Start

```bash
npm install
npm run tauri dev       # development
npm run build           # frontend build
npm run tauri build     # production build (MSI/NSIS)
```

## Tech Stack

| Component | Technology |
|---|---|
| Desktop framework | [Tauri 2](https://v2.tauri.app) (Rust + WebView2) |
| Frontend | Vanilla TypeScript, [Tailwind CSS v4](https://tailwindcss.com) |
| Editor | [CodeMirror 6](https://codemirror.net) |
| Markdown rendering | [marked](https://marked.js.org) + [DOMPurify](https://github.com/cure53/DOMPurify) |
| Syntax highlighting | [highlight.js](https://highlightjs.org) |
| Animations | [motion](https://motion.dev) (standalone Framer Motion) |
| AI backend | [Ollama](https://ollama.com) (local, REST API via Rust backend) |

## AI Formatting

Remark can format text as Markdown through a local Ollama model.

1. Enable **AI Formatting** in settings
2. Pick a model (recommended: `llama3.2:3b`)
3. Write text and click the AI icon

If Ollama is missing, a setup wizard will guide you through installation on first launch.

## Roadmap Ideas

- Session restore (reopen tabs from last session)
- Custom user CSS for preview styling
- Resizable split pane (drag editor/preview divider)
- Command palette (Ctrl+Shift+P)
- Clickable task list checkboxes in preview
- Vim / Emacs keybindings
- Markdown linting & link checker
- Git integration (diff view, staged changes)
- Auto-updater
- Multi-cursor editing
- Snippet / template support
- Plugin system

## License

MIT
