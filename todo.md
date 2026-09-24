# Projektplan: Remark

## 1. Zusammenfassung
Schlanke, schöne Desktop-App zum Öffnen, Bearbeiten und Anzeigen von Markdown-Dateien – mit Live-Vorschau, Syntax-Highlighting und Datei-Integration in Windows. Läuft als native App dank Tauri (Rust + WebView2) – kaum Ressourcenverbrauch, sieht aber aus wie ein Premium-Tool.

## 2. Tech-Stack
- **Desktop-Framework:** Tauri 2.0 (Rust-Backend, system-eigener WebView)
- **Frontend:** Vanilla TypeScript mit Tailwind CSS
- **Markdown-Engine:** `marked` + `DOMPurify`
- **Editor:** CodeMirror 6
- **Syntax-Highlighting:** `highlight.js`
- **Build-Tools:** `Vite`

## 3. Architektur-Überblick
```
Windows
  └── Tauri App (Rust)
       ├── Backend (Rust)
       │   ├── Dateisystem (read/write .md, File-Watcher)
       │   └── Windows-Integration (Datei-Assoziation)
       │
       └── Frontend (WebView2)
            ├── Toolbar (Datei öffnen/speichern, Theme togglen)
            ├── CodeMirror 6 (Editor-Panel)
            └── Markdown-Vorschau (gerendert via marked + highlight.js)
```

## 4. Features

### MVP (Version 1.0)
- [x] `.md`-Dateien per Doppelklick öffnen (Windows-Dateiassoziation)
- [x] Toggle zwischen Editor und Vorschau
- [x] Markdown-Rendering: Überschriften, Bold/Italic, Listen, Code-Blöcke, Links, Bilder, Tabellen
- [x] Syntax-Highlighting in Code-Blöcken
- [x] Auto-Save
- [x] Schönes Dark/Light-Theme mit cremigem Design
- [x] Drag & Drop `.md`-Dateien ins Fenster

### Version 1.x
- [x] Scroll-Synchronisation (Split-Ansicht)
- [x] Math-Unterstützung (KaTeX)
- [x] Diagramme (Mermaid.js)
- [x] Multi-Tab mit Session-Wiederherstellung
- [x] Export zu PDF/HTML
- [x] Inhaltsverzeichnis, Markdown-Lint, klickbare Task-Listen
- [x] KI-Formatierung über Ollama: Zeilen klassifizieren statt Text umschreiben (Abbrechen, Undo)
- [x] Tests (vitest, cargo test) + CI + Release-Workflow

### Später (Version 2.0+)
- [ ] Synchronisation
- [ ] Command Palette
- [ ] Eigenes CSS für die Vorschau
- [ ] Link-Checker

## 5. Aufgabenliste

### Setup & Grundstruktur
- [x] Projekt initialisieren (package.json, vite, tauri, tsconfig)
- [x] Tailwind CSS + Basiskonfiguration
- [x] Frontend-Grundgerüst: Toolbar, Editor-Panel, Preview-Panel
- [x] Dark/Light-Theme-Vorbereitung

### Core Features
- [x] CodeMirror 6 integrieren + Markdown-Syntax-Highlighting
- [x] Markdown-Parsing mit `marked` + gerenderte Vorschau
- [x] Syntax-Highlighting für Code-Blöcke mit Highlight.js
- [x] Toggle zwischen Reader/Edit-Modus
- [x] Datei öffnen (Rust-FS + Datei-Dialog)
- [x] Datei speichern + Auto-Save (Rust-FS)
- [x] Windows-Dateiassoziation für `.md`
- [x] Drag & Drop-Unterstützung

### Polish & Deployment
- [x] Creamy Design-System
- [x] Tastaturkürzel (Strg+S, Strg+O, Strg+Shift+V)
- [x] Icon + App-Name
- [x] Build + Installer (MSI/NSIS)
