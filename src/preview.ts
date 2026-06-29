import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  const sanitized = DOMPurify.sanitize(raw, {
    ADD_ATTR: ["target"],
  });
  return sanitized;
}

export function renderPreviewContent(container: HTMLElement, content: string): void {
  const html = renderMarkdown(content);
  container.innerHTML = html;
  container.querySelectorAll("pre code").forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });
}
