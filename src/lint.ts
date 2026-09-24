import type { LintIssue } from "./types";

const FENCE_RE = /^\s*(`{3,}|~{3,})/;

/** Simple Markdown style checks. Code blocks are skipped, two trailing spaces (hard break) are allowed. */
export function lintMarkdown(content: string): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!content.trim()) return issues;
  const lines = content.split("\n");
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const lineNum = i + 1;

    const fm = line.match(FENCE_RE);
    if (fm) {
      const marker = fm[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const trailing = line.match(/[ \t]+$/);
    if (trailing && line.trim() !== "" && trailing[0] !== "  ") {
      issues.push({ line: lineNum, column: line.length, message: "Trailing whitespace", rule: "trailing-space" });
    }

    if (i > 0 && line.trim() === "" && lines[i - 1].trim() === "") {
      issues.push({ line: lineNum, column: 1, message: "Consecutive blank lines", rule: "consecutive-blank-lines" });
    }

    if (/^#{1,6}[^#\s]/.test(line)) {
      issues.push({ line: lineNum, column: 1, message: "Missing space after heading marker", rule: "heading-space" });
    }

    // "-foo" at line start; rules (---), emphasis (*word*, **bold**) and numbers (-5) are fine.
    const lm = line.match(/^(\s*)([-+*])(?=[^\s\-*+\d])/);
    const isEmphasis = lm?.[2] === "*" && line.indexOf("*", lm[0].length) !== -1;
    if (lm && !isEmphasis && !/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      issues.push({ line: lineNum, column: lm[1].length + 1, message: "Missing space after list marker", rule: "list-marker-space" });
    }

    if (line.length > 120 && !/^\s*\|/.test(line) && !/https?:\/\//.test(line)) {
      issues.push({ line: lineNum, column: 121, message: `Line too long (${line.length} chars)`, rule: "line-length" });
    }
  }

  if (!content.endsWith("\n")) {
    issues.push({ line: lines.length, column: lines[lines.length - 1].length, message: "No trailing newline", rule: "final-newline" });
  }
  return issues;
}
