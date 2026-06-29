# Remark v1.0.0

A lightweight native Markdown editor with live preview and local AI formatting.

## Features

- Three views: Editor, Preview, or side by side Split
- Multi tab with file tree sidebar
- Syntax highlighting for 190+ languages via highlight.js
- KaTeX math with `$...$` inline and `$$...$$` block rendering
- Mermaid diagrams from code blocks rendered as SVG
- Image paste from clipboard, saves next to your .md file
- Export to clean HTML or PDF
- Table of contents sidebar panel with heading anchors
- Focus / Typewriter mode that dims inactive lines and centers content
- Word count and reading time shown live in status bar
- Spell check via native WebView2
- Find / Search with Ctrl+F and match counting
- Split pane resizer: drag the divider to resize editor and preview
- Session restore: tabs and scroll positions restored on restart
- Clickable task list checkboxes: toggle `[x]` in preview
- Auto update notification that checks GitHub for new releases
- Markdown linting: trailing spaces, heading format, line length and more
- AI formatting via local Ollama with first run setup wizard
- Dark and Light creamy theme
- File association: "Open with Remark" for .md files
- Drag and drop .md files
- Settings with Ollama config, auto save interval, recent files
- Keyboard shortcuts: Ctrl+O, Ctrl+S, Ctrl+F, Ctrl+Tab, Ctrl+N, F3

## Tech Stack

- Tauri 2 (Rust + WebView2)
- TypeScript
- CodeMirror 6
- marked
- highlight.js
- KaTeX
- Mermaid
- Tailwind CSS v4
- motion (animations)

## Install

Download the NSIS or MSI installer from Assets below.
