I built Remark – a native Markdown editor for Windows that's fast, free, and runs local AI formatting via Ollama

It's built with Tauri 2 (Rust + WebView2), so it stays under 10MB and uses barely any RAM compared to VS Code or Obsidian.

**What it does:**
- Three views: editor, preview, or side-by-side split
- Multi-tab support with file tree sidebar
- Syntax highlighting for 190+ languages
- KaTeX math ($...$) and Mermaid diagrams
- Image paste from clipboard (saves next to your .md)
- Export to clean HTML or PDF
- Find/Search (Ctrl+F), word count, focus/typewriter mode
- Auto-save, drag & drop, double-click .md files
- Creamy dark & light theme
- AI formatting via local Ollama (no data leaves your PC) – select text, click the AI button, get structured Markdown back
- First-run wizard that downloads & installs Ollama for you

**Why I built it:**
I wanted something between Notepad and Obsidian – native, instant-start, no Electron bloat, with AI that runs locally. It's like Typora but free and open-source.

**Tech:** Tauri 2, TypeScript, CodeMirror 6, marked (Markdown), highlight.js, motion (animations), Ollama (Rust backend)

**Download:** Grab the MSI/NSIS installer from GitHub Releases:
https://github.com/leg1tfx/Remark

It's MIT licensed. Feedback & contributions welcome!
