const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text for use in HTML content and attribute values. */
export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** File name of a Windows or POSIX path. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Parent directory of a path, using forward slashes. Empty string if there is none. */
export function dirName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.join("/");
}

export function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

/** Resolve `rel` against directory `dir` (forward slashes, handles `.` and `..`). */
export function resolvePath(dir: string, rel: string): string {
  if (isAbsolutePath(rel)) return rel.replace(/\\/g, "/");
  const out = dir.replace(/\\/g, "/").split("/");
  for (const part of rel.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 1) out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join("/");
}

/** Compare two file paths the way Windows does (slash- and case-insensitive). */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
