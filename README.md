# Remark

Ein schlanker, nativer Markdown-Editor mit Live-Vorschau und KI-Formatierung via [Ollama](https://ollama.com).

## Features

- **Drei Ansichten** – Editor, Vorschau oder Split-View nebeneinander
- **Syntax-Highlighting** – Code-Blöcke in über 190 Sprachen via highlight.js
- **Auto-Save** – konfigurierbares Intervall (Standard: 2s)
- **Datei-Integration** – Doppelklick auf `.md`-Dateien, Drag & Drop
- **Dark/Light-Theme** – warmes, cremiges Design
- **KI-Formatierung** – Markdown mit lokalem Ollama-Modell formatieren lassen
- **Erstsetup-Assistent** – Ollama automatisch herunterladen, installieren und Modell pullen
- **Find/Search** – Volltextsuche im Editor (Strg+F)

## Quick Start

```bash
# Abhängigkeiten installieren
npm install

# Entwicklung starten
npm run tauri dev

# Produktions-Build (MSI/NSIS)
npm run build
npm run tauri build
```

## Tech-Stack

| Komponente | Technologie |
|---|---|
| Desktop-Framework | [Tauri 2](https://v2.tauri.app) (Rust + WebView2) |
| Frontend | Vanilla TypeScript, [Tailwind CSS v4](https://tailwindcss.com) |
| Editor | [CodeMirror 6](https://codemirror.net) |
| Markdown-Rendering | [marked](https://marked.js.org) + [DOMPurify](https://github.com/cure53/DOMPurify) |
| Syntax-Highlighting | [highlight.js](https://highlightjs.org) |
| Animationen | [motion](https://motion.dev) (Standalone Framer Motion) |
| KI-Backend | [Ollama](https://ollama.com) (lokal, REST-API über Rust-Backend) |

## KI-Formatierung

Remark kann Text über ein lokales Ollama-Modell als Markdown formatieren lassen.

1. In den Einstellungen **KI-Formatierung aktivieren**
2. (Optional) Ein Modell auswählen – empfohlen: `llama3.2:3b`
3. Text schreiben und auf das KI-Icon klicken

Fehlt Ollama, öffnet sich beim ersten Start ein Assistent, der alles automatisch einrichtet.

## Lizenz

MIT
