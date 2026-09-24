import { EditorView, keymap, placeholder, highlightActiveLine } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { searchKeymap, findNext, findPrevious, closeSearchPanel, openSearchPanel } from "@codemirror/search";

let view: EditorView | null = null;
let findController: AbortController | null = null;
let currentLanguage = "en";
const languageConf = new Compartment();
/** Editor state (doc, undo history, selection) per open document, so undo never crosses tabs. */
const documentStates = new Map<string, EditorState>();

function languageAttributes() {
  return EditorView.contentAttributes.of({ spellcheck: "true", lang: currentLanguage });
}

export function setEditorLanguage(lang: string): void {
  currentLanguage = lang;
  view?.dispatch({ effects: languageConf.reconfigure(languageAttributes()) });
}

function buildExtensions() {
  return [
    markdown({ codeLanguages: languages }),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    placeholder("Start writing..."),
    EditorView.lineWrapping,
    languageConf.of(languageAttributes()),
    highlightActiveLine(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        dispatchEvent(new CustomEvent("editor-change", {
          detail: { content: update.state.doc.toString() },
        }));
      }
    }),
    EditorView.theme({
      "&": {
        backgroundColor: "transparent",
        color: "var(--text)",
      },
      ".cm-content": {
        caretColor: "var(--accent)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--accent)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "var(--accent-bg) !important",
      },
      ".cm-activeLine": {
        backgroundColor: "var(--hover)",
      },
      ".cm-matchingBracket": {
        backgroundColor: "var(--accent-bg)",
        outline: "1px solid var(--accent)",
      },
      ".cm-placeholder": {
        color: "var(--text-tertiary)",
      },
    }),
  ];
}

/**
 * Show a document in the editor. Its previous state (undo history, selection) is restored
 * if it was stashed and the content is unchanged; no change event is fired.
 */
export function openDocument(key: string, content: string): void {
  if (!view) return;
  const saved = documentStates.get(key);
  const next = saved && saved.doc.toString() === content
    ? saved
    : EditorState.create({ doc: content, extensions: buildExtensions() });
  view.setState(next);
  // A stashed state may carry an older spell-check language.
  view.dispatch({ effects: languageConf.reconfigure(languageAttributes()) });
}

/** Remember the current editor state for `key` (call before switching away). */
export function stashDocument(key: string): void {
  if (view) documentStates.set(key, view.state);
}

/**
 * Record a whole-document replacement for a document that is not shown in the editor
 * (e.g. formatted from the preview), so it can still be undone later.
 */
export function recordDocumentChange(key: string, before: string, after: string): void {
  const saved = documentStates.get(key);
  const base = saved && saved.doc.toString() === before
    ? saved
    : EditorState.create({ doc: before, extensions: buildExtensions() });
  documentStates.set(key, base.update({ changes: { from: 0, to: base.doc.length, insert: after } }).state);
}

export function forgetDocument(key: string): void {
  documentStates.delete(key);
}

export function createEditor(container: HTMLElement, language = "en"): EditorView {
  currentLanguage = language;
  const state = EditorState.create({ doc: "", extensions: buildExtensions() });

  view = new EditorView({
    state,
    parent: container,
  });

  // Remove previous listener to prevent leak
  if (findController) findController.abort();
  findController = new AbortController();
  addEventListener("editor-find", ((e: CustomEvent) => {
    const { query, direction } = e.detail;
    if (!view) return;
    if (!query) {
      closeSearchPanel(view);
      return;
    }
    if (direction === "init") {
      openSearchPanel(view);
    }
    if (direction === "next") {
      findNext(view);
    } else if (direction === "prev") {
      findPrevious(view);
    }
  }) as EventListener, { signal: findController.signal });

  return view;
}

export function setEditorContent(content: string): void {
  if (!view) return;
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
  });
}

export function getEditorContent(): string {
  if (!view) return "";
  return view.state.doc.toString();
}

export function getEditorScrollElement(): HTMLElement | null {
  return view?.scrollDOM ?? null;
}

export function getEditorScrollTop(): number {
  if (!view) return 0;
  return view.scrollDOM.scrollTop;
}

export function setEditorScrollTop(n: number): void {
  if (!view) return;
  view.scrollDOM.scrollTop = n;
}

export function getEditorView(): EditorView | null {
  return view;
}

export function insertAtCursor(text: string): void {
  if (!view) return;
  const from = view.state.selection.main.head;
  view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  });
}

export function getSelection(): string {
  if (!view) return "";
  const { from, to } = view.state.selection.main;
  if (from === to) return "";
  return view.state.doc.sliceString(from, to);
}

export function replaceSelection(text: string): void {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
}

export function wrapLines(prefix: string): void {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  if (from === to) {
    const line = view.state.doc.lineAt(from);
    view.dispatch({
      changes: { from: line.from, insert: prefix },
      selection: { anchor: from + prefix.length },
    });
    return;
  }
  const text = view.state.doc.sliceString(from, to);
  const lines = text.split("\n").map((l) => prefix + l).join("\n");
  view.dispatch({
    changes: { from, to, insert: lines },
    selection: { anchor: from, head: from + lines.length },
  });
}

export function setHeading(level: number): void {
  if (!view) return;
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = "#".repeat(level) + " ";
  const match = line.text.match(/^(#{1,6})\s/);
  if (match) {
    const old = match[0];
    view.dispatch({
      changes: { from: line.from, to: line.from + old.length, insert: prefix },
    });
  } else {
    view.dispatch({
      changes: { from: line.from, insert: prefix },
    });
  }
}

export function wrapLink(): void {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  if (from === to) {
    insertAtCursor("[Link text](url)");
    return;
  }
  const text = view.state.doc.sliceString(from, to);
  view.dispatch({
    changes: { from, to, insert: `[${text}](url)` },
    selection: { anchor: from + 1, head: from + 1 + text.length },
  });
}

export function wrapSelection(prefix: string, suffix: string): void {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const text = view.state.doc.sliceString(from, to);
  view.dispatch({
    changes: { from, to, insert: `${prefix}${text}${suffix}` },
    selection: { anchor: from + prefix.length, head: to + prefix.length },
  });
}

/** Replace one line (0-based) in a single undoable change, keeping the cursor elsewhere intact. */
export function replaceLine(index: number, text: string): void {
  if (!view || index < 0 || index >= view.state.doc.lines) return;
  const line = view.state.doc.line(index + 1);
  if (line.text === text) return;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
}

/** Move the cursor to a 1-based line and scroll it into the middle of the view. */
export function goToLine(lineNumber: number): void {
  if (!view) return;
  const n = Math.min(Math.max(1, lineNumber), view.state.doc.lines);
  const line = view.state.doc.line(n);
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
  view.focus();
}

export function destroyEditor(): void {
  if (view) {
    view.destroy();
    view = null;
  }
}
