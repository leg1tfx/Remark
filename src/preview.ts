import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import katex from "katex";

marked.use({
  extensions: [{
    name: "inlineMath",
    level: "inline",
    start(src: string) { return src.indexOf("$"); },
    tokenizer(src: string) {
      // Pandoc rules: no space after the opening / before the closing $, and the closing $
      // must not be followed by a digit, so "costs $5 and $10" stays plain text.
      const match = src.match(/^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/);
      if (match) {
        return { type: "inlineMath", raw: match[0], text: match[1] };
      }
    },
    renderer(token: any) {
      try {
        return katex.renderToString(token.text, { displayMode: false, throwOnError: false });
      } catch {
        return token.text;
      }
    },
  }, {
    name: "blockMath",
    level: "block",
    start(src: string) { return src.indexOf("$$"); },
    tokenizer(src: string) {
      const match = src.match(/^\$\$([\s\S]+?)\$\$(?:\n|$)/);
      if (match) {
        return { type: "blockMath", raw: match[0], text: match[1] };
      }
    },
    renderer(token: any) {
      try {
        return katex.renderToString(token.text.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return token.text;
      }
    },
  }],
});

marked.setOptions({ gfm: true });

export interface RenderOptions {
  /** Render single line breaks as <br> (non-standard, off by default). */
  breaks?: boolean;
  /** Enable task list checkboxes. */
  interactive?: boolean;
  dark?: boolean;
  /** Map a relative/local image src to a loadable URL, or null to leave it unchanged. */
  resolveImage?: (src: string) => string | null;
}

export function renderMarkdown(markdown: string, opts: RenderOptions = {}): string {
  const raw = marked.parse(markdown, { async: false, breaks: opts.breaks ?? false }) as string;
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target", "type", "checked", "disabled"],
    ADD_TAGS: ["input",
      "math", "mi", "mo", "mn", "ms", "mfrac", "msup", "msub",
      "mtable", "mtr", "mtd", "mrow", "msqrt", "mroot", "merror",
      "mpadded", "mphantom", "menclose", "mstyle", "msubsup",
      "mspace", "mfenced", "annotation", "semantics", "mover",
      "munder", "munderover",
    ],
  });
}

/** GitHub-like heading slug that keeps non-ASCII letters (Übersicht → übersicht). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function renderPreviewContent(container: HTMLElement, content: string, opts: RenderOptions = {}): Promise<void> {
  container.innerHTML = renderMarkdown(content, opts);

  if (opts.resolveImage) {
    container.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      const resolved = src ? opts.resolveImage!(src) : null;
      if (resolved) img.src = resolved;
    });
  }

  container.querySelectorAll("pre code:not(.language-mermaid)").forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });

  // Heading ids (deduplicated like GitHub: foo, foo-1, foo-2) and hover anchors.
  const seen = new Map<string, number>();
  container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6").forEach((h) => {
    const title = (h.textContent || "").trim();
    h.dataset.title = title;
    const base = slugify(title);
    if (!base) return;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    h.id = id;
    const a = document.createElement("a");
    a.href = `#${encodeURIComponent(id)}`;
    a.className = "heading-anchor";
    a.setAttribute("aria-hidden", "true");
    a.textContent = "#";
    h.append(a);
  });

  // marked renders GFM task items as <li><input disabled type="checkbox"> …</li>
  // (inside a <p> for loose lists); number them in document order.
  let taskIndex = 0;
  container.querySelectorAll<HTMLInputElement>("li > input[type=checkbox], li > p > input[type=checkbox]").forEach((cb) => {
    if (cb.previousSibling && cb.previousSibling.textContent?.trim()) return;
    const li = cb.closest("li")!;
    if (cb.parentElement !== li && cb.parentElement !== li.firstElementChild) return;
    li.classList.add("task-list-item");
    cb.dataset.taskIndex = String(taskIndex++);
    cb.disabled = !opts.interactive;
  });

  const mermaidBlocks = container.querySelectorAll("pre code.language-mermaid");
  if (mermaidBlocks.length > 0) await renderMermaidBlocks(container, mermaidBlocks, opts.dark ?? false);
}

async function renderMermaidBlocks(container: HTMLElement, blocks: NodeListOf<Element>, dark: boolean): Promise<void> {
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" });
    blocks.forEach((block) => {
      const div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = block.textContent || "";
      block.parentElement!.replaceWith(div);
    });
    if (!container.isConnected) return;
    await mermaid.run({ nodes: container.querySelectorAll<HTMLElement>(".mermaid") });
  } catch {
    // Invalid diagrams keep their source text.
  }
}

/** Nested table of contents built from the rendered headings, or null if there are none. */
export function buildToc(container: HTMLElement): HTMLUListElement | null {
  const headings = container.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
  if (!headings.length) return null;

  const root = document.createElement("ul");
  root.className = "toc-list";
  const lists: HTMLUListElement[] = [root];
  let level = 1;
  headings.forEach((h) => {
    const target = Number(h.tagName[1]);
    while (level < target) {
      const ul = document.createElement("ul");
      const parent = lists[lists.length - 1];
      (parent.lastElementChild ?? parent).appendChild(ul);
      lists.push(ul);
      level++;
    }
    while (level > target) {
      lists.pop();
      level--;
    }
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${encodeURIComponent(h.id)}`;
    a.className = "toc-link";
    a.dataset.level = String(target);
    a.dataset.target = h.id;
    a.textContent = h.dataset.title || h.textContent || "";
    li.appendChild(a);
    lists[lists.length - 1].appendChild(li);
  });
  return root;
}
