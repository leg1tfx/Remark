// Task list items (`- [ ] todo`) in Markdown source, in the order the preview renders them.

const TASK_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/;
const FENCE_RE = /^\s*(?:>\s*)*(`{3,}|~{3,})/;

/** Line indices (0-based) of all task list items outside fenced code blocks. */
export function findTaskLines(content: string): number[] {
  const lines = content.split("\n");
  const result: number[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (m) {
      const marker = m[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence === null && TASK_RE.test(lines[i])) result.push(i);
  }
  return result;
}

/** The given line with its task checkbox set to `checked`. */
export function setTaskChecked(line: string, checked: boolean): string {
  return line.replace(TASK_RE, (_, prefix: string) => `${prefix}[${checked ? "x" : " "}]`);
}
