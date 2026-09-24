# Remark v1.1.0

## Highlights

- **AI formatting that cannot change your words.** The model now only decides what each
  line is (heading, list item, quote, paragraph); Remark adds the Markdown itself.
  Existing Markdown and code blocks are left alone, and the result is one undo step.
- **No more lost work.** Modified files are saved before the window closes, untitled tabs
  are kept in the session, and auto-save covers every open tab.
- **Reliable dialogs and menus.** Overlays no longer get stuck half-visible, the "Saved"
  toast no longer blocks the window, and Escape closes only the topmost dialog.

## Fixes

- AI formatting no longer drops the first paragraph
- AI requests show progress and can be cancelled
- Opening a file by double-click no longer duplicates a tab or wipes the last session
- Undo stays within its tab
- Task list checkboxes in the preview can be ticked
- Headings with umlauts get working anchors and table of contents links
- Pasted images show in the preview
- Links open in the browser instead of replacing the app window
- `$5 and $10` is no longer rendered as math
- Sidebar folders collapse again on Windows
- Lint entries jump to the right line
- HTML export includes code highlighting; PDF export prints without a popup
- The dark theme is remembered

## Changes

- Single line breaks follow standard Markdown by default; the old behaviour can be
  switched on in Settings ("Single line breaks as <br>")
- AI setup verifies the Ollama installer's signature and pulls models with a progress bar
- Update notification uses proper version comparison

---

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
