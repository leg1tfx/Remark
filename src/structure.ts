// "Classify, don't rewrite": the AI only decides what each plain-text line is
// (heading, list item, …). This module turns those decisions into Markdown.
// It only ever adds markers (#, -, 1., >) and blank lines and strips bullet glyphs
// like "•", so the user's words can never be changed.

export type BlockLabel = "heading1" | "heading2" | "heading3" | "bullet" | "numbered" | "quote" | "paragraph";
type LineKind = BlockLabel | "blank" | "keep";

export interface StructurePlan {
  lines: string[];
  /** Decided kind per line; null = ask the AI. */
  kinds: (LineKind | null)[];
  /** Indices of lines the AI has to classify. */
  candidates: number[];
}

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
// Lines that already are Markdown structure (or HTML / tables / rules) are left alone.
const MARKDOWN_RE = /^(\s{0,3}(#{1,6}(\s|$)|[-*+]\s|\d{1,9}[.)]\s|>|\||<[a-zA-Z/!]|(?:[-*_]\s*){3,}$|!\[|\$\$)|\s{4,}|\t)/;
const BULLET_GLYPH_RE = /^(\s*)[•·▪▫●○◦‣⁃–—➢➤►▶✓✔☐☑]\s*/;
const PAREN_NUMBER_RE = /^(\s*)\((\d{1,3})\)\s+/;
const SENTENCE_END_RE = /[.!?:…"'“”»)\]]$/;

const HEADING_MAX_CHARS = 80;

export function planStructure(text: string): StructurePlan {
  const lines = text.split("\n");
  const kinds: (LineKind | null)[] = [];
  const candidates: number[] = [];
  let fence: string | null = null;

  lines.forEach((line, i) => {
    const fm = line.match(FENCE_RE);
    if (fm || fence !== null) {
      if (fm) {
        const marker = fm[1];
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      }
      kinds.push("keep");
    } else if (!line.trim()) {
      kinds.push("blank");
    } else if (BULLET_GLYPH_RE.test(line)) {
      kinds.push("bullet");
    } else if (PAREN_NUMBER_RE.test(line)) {
      kinds.push("numbered");
    } else if (MARKDOWN_RE.test(line)) {
      kinds.push("keep");
    } else {
      kinds.push(null);
      candidates.push(i);
    }
  });
  return { lines, kinds, candidates };
}

function isHeading(k: LineKind): boolean {
  return k === "heading1" || k === "heading2" || k === "heading3";
}

/** A blank line is needed between these blocks, otherwise Markdown merges them. */
function needsBlankLine(prev: LineKind, prevText: string, next: LineKind): boolean {
  if (prev === "blank" || prev === "keep" || next === "keep") return false;
  if (isHeading(prev) || isHeading(next)) return true;
  if (prev === next) {
    // Two paragraph lines: separate them only if the first one ends a sentence,
    // so hard-wrapped paragraphs stay together.
    return prev === "paragraph" && SENTENCE_END_RE.test(prevText.trim());
  }
  // Paragraph after a list item or quote would otherwise continue that item/quote.
  return true;
}

/** Apply the decided kinds. Headings that look like sentences are kept as paragraphs. */
export function applyStructure(plan: StructurePlan, labels: Map<number, BlockLabel>): string {
  const out: string[] = [];
  let prev: LineKind = "blank";
  let prevText = "";
  let number = 0;

  plan.lines.forEach((line, i) => {
    let kind: LineKind = plan.kinds[i] ?? labels.get(i) ?? "paragraph";
    const trimmed = line.trim();
    if (isHeading(kind) && (trimmed.length > HEADING_MAX_CHARS || /[.,;]$/.test(trimmed))) {
      kind = "paragraph";
    }

    if (kind === "blank" || kind === "keep") {
      out.push(line);
      prev = kind;
      prevText = line;
      return;
    }

    if (needsBlankLine(prev, prevText, kind) && out.length && out[out.length - 1].trim()) out.push("");

    const indent = line.match(/^\s*/)![0];
    let result: string;
    switch (kind) {
      case "heading1": result = `# ${trimmed}`; break;
      case "heading2": result = `## ${trimmed}`; break;
      case "heading3": result = `### ${trimmed}`; break;
      case "bullet": result = `${indent}- ${line.replace(BULLET_GLYPH_RE, "").trim()}`; break;
      case "numbered": {
        number = prev === "numbered" ? number + 1 : 1;
        result = `${indent}${number}. ${line.replace(PAREN_NUMBER_RE, "").trim()}`;
        break;
      }
      case "quote": result = `> ${trimmed}`; break;
      default: result = line;
    }
    out.push(result);
    prev = kind;
    prevText = line;
  });

  return out.join("\n");
}

/** Split a list into chunks so each AI request stays short enough for small models. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
