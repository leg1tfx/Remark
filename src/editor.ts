import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { searchKeymap, findNext, findPrevious, closeSearchPanel, openSearchPanel } from "@codemirror/search";

let view: EditorView | null = null;

export function createEditor(container: HTMLElement, darkMode: boolean): EditorView {
  const state = EditorState.create({
    doc: "",
    extensions: [
      markdown({ codeLanguages: languages }),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      placeholder("Starte mit dem Schreiben..."),
      EditorView.lineWrapping,
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
      ...(darkMode ? [oneDark] : []),
    ],
  });

  view = new EditorView({
    state,
    parent: container,
  });

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
  }) as EventListener);

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
  // recreate with new theme
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

export function destroyEditor(): void {
  if (view) {
    view.destroy();
    view = null;
  }
}
