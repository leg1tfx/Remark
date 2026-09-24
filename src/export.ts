import katex from "katex";
import hljs from "highlight.js";
import { renderPreviewContent, type RenderOptions } from "./preview";
import { escHtml } from "./utils";

/** Render Markdown in an off-screen container so hljs and Mermaid (which needs layout) run. */
export async function renderToHtml(content: string, opts: RenderOptions): Promise<string> {
  const host = document.createElement("div");
  host.className = "markdown-body";
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;visibility:hidden;pointer-events:none";
  document.body.appendChild(host);
  try {
    await renderPreviewContent(host, content, { ...opts, interactive: false });
    return host.innerHTML;
  } finally {
    host.remove();
  }
}

/** Standalone HTML file. Styles for math and code come from the CDN at the bundled versions. */
export function buildHtmlDocument(title: string, bodyHtml: string, dark: boolean): string {
  const bg = dark ? "#1e1e1e" : "#f5f0eb";
  const text = dark ? "#e8e4dd" : "#3d352c";
  const accent = "#c4845a";
  const surface = dark ? "#2a2a2a" : "#f0ece6";
  const border = dark ? "#3a3a3a" : "#ddd";
  const hljsTheme = dark ? "github-dark" : "github";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@${hljs.versionString}/styles/${hljsTheme}.min.css">
<style>
body { max-width: 800px; margin: 0 auto; padding: 40px 32px; background: ${bg}; color: ${text}; font-size: 15px; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
img { max-width: 100%; border-radius: 8px; }
pre { background: ${surface}; padding: 16px; border-radius: 8px; overflow-x: auto; }
pre code.hljs { background: transparent; padding: 0; }
code { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.9em; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.6em 1em; border: 1px solid ${border}; text-align: left; }
blockquote { border-left: 4px solid ${accent}; padding: 0.5em 1em; margin: 1em 0; background: ${surface}; border-radius: 0 8px 8px 0; }
a { color: ${accent}; }
.heading-anchor { display: none; }
li.task-list-item { list-style: none; }
</style>
</head><body>${bodyHtml}</body></html>`;
}

/**
 * Print the document through the app's own window: the rendered Markdown goes into
 * #print-root and print CSS hides the rest of the UI. Works in WebView2 without popups
 * and keeps the bundled KaTeX/highlight styles.
 */
export async function printMarkdown(content: string, opts: RenderOptions): Promise<void> {
  let root = document.getElementById("print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "print-root";
    root.className = "markdown-body";
    document.body.appendChild(root);
  }
  const printRoot = root;
  await renderPreviewContent(printRoot, content, { ...opts, dark: false, interactive: false });
  document.body.classList.add("printing");
  const cleanup = () => {
    document.body.classList.remove("printing");
    printRoot.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
