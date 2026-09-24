// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildToc, renderMarkdown, renderPreviewContent, slugify } from "../src/preview";

describe("slugify", () => {
  it("keeps umlauts and other letters", () => {
    expect(slugify("Übersicht")).toBe("übersicht");
    expect(slugify("Größe & Gewicht!")).toBe("größe-gewicht");
    expect(slugify("1. Intro")).toBe("1-intro");
  });
});

describe("renderPreviewContent", () => {
  it("numbers task checkboxes (tight and loose lists) and enables them", async () => {
    const el = document.createElement("div");
    await renderPreviewContent(el, "- [ ] a\n- [x] b\n\n1. [ ] c\n\n2. [ ] d\n", { interactive: true });
    const boxes = Array.from(el.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect(boxes.map((b) => b.dataset.taskIndex)).toEqual(["0", "1", "2", "3"]);
    expect(boxes.every((b) => !b.disabled)).toBe(true);
    expect(boxes[1].checked).toBe(true);
    expect(el.querySelectorAll("li.task-list-item").length).toBe(4);
  });

  it("deduplicates heading ids", async () => {
    const el = document.createElement("div");
    await renderPreviewContent(el, "# Größe\n## Größe\n## Größe\n");
    expect(Array.from(el.querySelectorAll("h1, h2")).map((h) => h.id)).toEqual(["größe", "größe-1", "größe-2"]);
  });

  it("resolves relative images", async () => {
    const el = document.createElement("div");
    await renderPreviewContent(el, "![x](assets/a.png)", { resolveImage: (src) => `asset://${src}` });
    expect(el.querySelector("img")!.getAttribute("src")).toBe("asset://assets/a.png");
  });
});

describe("buildToc", () => {
  it("never interprets heading text as HTML", async () => {
    const el = document.createElement("div");
    await renderPreviewContent(el, "# &lt;img src=x onerror=alert(1)&gt;\n");
    const toc = buildToc(el)!;
    expect(toc.querySelector("img")).toBeNull();
    expect(toc.querySelector("a")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("nests by level", async () => {
    const el = document.createElement("div");
    await renderPreviewContent(el, "# A\n## B\n### C\n# D\n");
    const toc = buildToc(el)!;
    expect(toc.children.length).toBe(2);
    expect(toc.querySelector("ul ul a")!.textContent).toBe("C");
  });
});

describe("renderMarkdown", () => {
  it("does not treat prices as math", () => {
    const html = renderMarkdown("costs $5 and $10");
    expect(html).not.toContain("katex");
    expect(html).toContain("$5 and $10");
  });

  it("renders real inline math", () => {
    expect(renderMarkdown("area $a^2$ here")).toContain("katex");
  });

  it("uses standard line breaks unless enabled", () => {
    expect(renderMarkdown("a\nb")).not.toContain("<br>");
    expect(renderMarkdown("a\nb", { breaks: true })).toContain("<br>");
  });

  it("sanitizes scripts", () => {
    expect(renderMarkdown("<img src=x onerror=alert(1)><script>x()</script>")).not.toMatch(/onerror|<script/);
  });
});
