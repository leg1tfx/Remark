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
- **Tabs & session restore** – Reopens your tabs (including unsaved untitled ones) on start
- **Math & diagrams** – KaTeX (`$…$`, `$$…$$`) and Mermaid code blocks
- **Task lists** – Tick `- [ ]` checkboxes directly in the preview
- **Table of contents, lint, export** – TOC sidebar, Markdown lint panel, HTML and PDF export
- **Safe closing** – Modified files are saved before the window closes

## Quick Start

```bash
npm install
npm run tauri dev       # development
npm run build           # frontend build
npm run tauri build     # production build (MSI/NSIS)
```

On Windows, `scripts/build-installer.bat` runs the full installer build.

## Development

```bash
npm run typecheck                         # TypeScript
npm test                                  # frontend unit tests (vitest)
cd src-tauri && cargo test                # backend unit tests
cd src-tauri && cargo clippy --all-targets
```

CI runs all of these on every push and pull request. Pushing a tag like `v1.1.0`
builds the Windows installers and creates a draft GitHub release.

### Code layout

| File | Purpose |
|---|---|
| `src/main.ts` | App wiring: tabs, session, settings, AI dialogs, events |
| `src/overlay.ts` | Show/hide controller for all dialogs, menus, toast and drop zone |
| `src/preview.ts` | Markdown rendering, heading ids, task lists, TOC |
| `src/editor.ts` | CodeMirror setup, per-tab editor state |
| `src/export.ts` | HTML export and printing (PDF) |
| `src/structure.ts` | AI formatting: applies line labels as Markdown (unit tested) |
| `src/lint.ts`, `src/tasks.ts`, `src/utils.ts` | Pure helpers (unit tested) |
| `src-tauri/src/lib.rs` | Tauri commands: files, settings, Ollama, updates |
| `src-tauri/src/ollama_text.rs` | Parsing model output: labels, corrected text (unit tested) |

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
3. Write text and choose **Format with AI** (or right-click a selection)

**How formatting works – classify, don't rewrite.** The model never writes your text.
It only decides for each plain line whether it is a heading, a list item, a quote or a
normal paragraph (the answer is restricted to these labels by a JSON schema). Remark then
adds the Markdown itself (`src/structure.ts`), so no word can be changed, dropped or
invented. Existing Markdown and code blocks are left alone, obvious cases like `•` bullets
or `(1)` numbering are converted without AI, and headings that read like full sentences
are kept as paragraphs.

*Correct spelling* (right-click a selection) is the only feature where the model writes
text; it streams with a live character count. All AI requests can be cancelled.
If Ollama is missing, a setup wizard downloads the installer (checked for a valid
Windows signature before it runs), installs it and pulls the model.

## Roadmap Ideas

- Custom user CSS for preview styling
- Command palette (Ctrl+Shift+P)
- Vim / Emacs keybindings
- Link checker
- Git integration (diff view, staged changes)
- In-app auto-updater (currently: update notification)
- Multi-cursor editing
- Snippet / template support
- Plugin system

## License

MIT
