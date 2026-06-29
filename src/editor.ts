import { EditorView, keymap, placeholder, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { searchKeymap, findNext, findPrevious, closeSearchPanel, openSearchPanel } from "@codemirror/search";

let view: EditorView | null = null;
let suppressChange = false;
let findController: AbortController | null = null;

export function suppressChangeEvents(val: boolean): void {
  suppressChange = val;
}

export function setEditorLanguage(lang: string): void {
  if (!view) return;
  const cmContent = view.dom.querySelector(".cm-content") as HTMLElement | null;
  if (cmContent) cmContent.lang = lang;
}

export function createEditor(container: HTMLElement, darkMode: boolean, language = "en"): EditorView {
  const state = EditorState.create({
    doc: "",
    extensions: [
      markdown({ codeLanguages: languages }),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      placeholder("Start writing..."),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "true", lang: language }),
      highlightActiveLine(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressChange) {
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
      ...(darkMode ? [oneDark] : []),
    ],
  });

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

export function setEditorDarkMode(dark: boolean): void {
  if (!view) return;
  const pos = view.state.selection.main.head;
  const content = view.state.doc.toString();
  const parent = view.dom.parentElement;
  if (!parent) return;
  view.destroy();
  view = createEditor(parent, dark);
  setEditorContent(content);
  view.dispatch({
    selection: { anchor: pos, head: pos },
  });
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

export function destroyEditor(): void {
  if (view) {
    view.destroy();
    view = null;
  }
}
