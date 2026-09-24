import { describe, expect, it } from "vitest";
import { baseName, dirName, escHtml, isAbsolutePath, resolvePath, samePath } from "../src/utils";

describe("utils", () => {
  it("escapes HTML", () => {
    expect(escHtml(`<img src=x onerror="a('b')">&`)).toBe("&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  });

  it("splits Windows and POSIX paths", () => {
    expect(baseName("C:\\docs\\notes.md")).toBe("notes.md");
    expect(baseName("/home/a/b.md")).toBe("b.md");
    expect(dirName("C:\\docs\\notes.md")).toBe("C:/docs");
    expect(dirName("notes.md")).toBe("");
  });

  it("resolves relative paths", () => {
    expect(resolvePath("C:/docs/sub", "../img/a.png")).toBe("C:/docs/img/a.png");
    expect(resolvePath("/home/a", "./assets/p.png")).toBe("/home/a/assets/p.png");
    expect(resolvePath("/home/a", "D:\\x.png")).toBe("D:/x.png");
    expect(isAbsolutePath("\\\\server\\share\\a.md")).toBe(true);
  });

  it("compares paths like Windows", () => {
    expect(samePath("C:\\Docs\\A.md", "c:/docs/a.md")).toBe(true);
    expect(samePath("C:/docs/a.md", "C:/docs/b.md")).toBe(false);
  });
});
