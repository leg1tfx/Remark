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
      const match = src.match(/^\$([^$]+?)\$/);
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
      const match = src.match(/^\$\$([\s\S]+?)\$\$/);
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

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target"],
    ADD_TAGS: [
      "math", "mi", "mo", "mn", "ms", "mfrac", "msup", "msub",
      "mtable", "mtr", "mtd", "mrow", "msqrt", "mroot", "merror",
      "mpadded", "mphantom", "menclose", "mstyle", "msubsup",
      "mspace", "mfenced", "annotation", "semantics", "mover",
      "munder", "munderover",
    ],
  });
  return sanitized;
}

let mermaidInitialized = false;

export function renderPreviewContent(container: HTMLElement, content: string): void {
  const html = renderMarkdown(content);
  container.innerHTML = html;

  // Syntax highlighting for code blocks
  container.querySelectorAll("pre code:not(.language-mermaid)").forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });

  // Mermaid diagrams
  const mermaidBlocks = container.querySelectorAll("pre code.language-mermaid");
  if (mermaidBlocks.length > 0) {
    if (!mermaidInitialized) {
      import("mermaid").then((mod) => {
        mod.default.initialize({ startOnLoad: false, theme: "default" });
        mermaidInitialized = true;
        renderMermaidBlocks(container, mermaidBlocks);
      }).catch(() => {});
    } else {
      renderMermaidBlocks(container, mermaidBlocks);
    }
  }

  // Heading IDs for TOC
  container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    const text = h.textContent || "";
    const slug = text.toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (slug) h.id = slug;

    // Add anchor link
    if (slug) {
      const a = document.createElement("a");
      a.href = `#${slug}`;
      a.className = "heading-anchor";
      a.textContent = "#";
      a.style.cssText = "opacity:0;margin-left:6px;font-size:0.8em;color:var(--accent);text-decoration:none;transition:opacity 0.15s";
      h.addEventListener("mouseenter", () => a.style.opacity = "1");
      h.addEventListener("mouseleave", () => a.style.opacity = "0");
      h.prepend(a);
    }
  });

  // Emit TOC update
  dispatchEvent(new CustomEvent("toc-update", { detail: { container } }));
}

function renderMermaidBlocks(container: HTMLElement, blocks: NodeListOf<Element>): void {
  import("mermaid").then((mod) => {
    blocks.forEach((block) => {
      const pre = block.parentElement!;
      const text = block.textContent || "";
      const div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = text;
      pre.replaceWith(div);
    });
    mod.default.run({ nodes: container.querySelectorAll(".mermaid") });
  }).catch(() => {});
}

export function extractTOC(container: HTMLElement): string {
  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
  if (!headings.length) return "";

  let html = '<ul class="toc-list">';
  let prevLevel = 1;
  headings.forEach((h) => {
    const level = parseInt(h.tagName[1]);
    const id = h.id;
    const text = h.textContent?.replace(/^#\s*/, "").trim() || "";

    while (prevLevel < level) { html += '<ul>'; prevLevel++; }
    while (prevLevel > level) { html += '</ul>'; prevLevel--; }

    html += `<li><a href="#${id}" class="toc-link" data-level="${level}">${text}</a></li>`;
  });
  while (prevLevel > 1) { html += '</ul>'; prevLevel--; }
  html += "</ul>";
  return html;
}
