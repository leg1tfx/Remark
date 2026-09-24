import { describe, expect, it } from "vitest";
import { lintMarkdown } from "../src/lint";

const rules = (md: string) => lintMarkdown(md).map((i) => `${i.line}:${i.rule}`);

describe("lintMarkdown", () => {
  it("reports basic issues", () => {
    expect(rules("#Title\n-item\ntext \n\n\nend")).toEqual([
      "1:heading-space",
      "2:list-marker-space",
      "3:trailing-space",
      "5:consecutive-blank-lines",
      "6:final-newline",
    ]);
  });

  it("allows hard line breaks, rules, emphasis and code", () => {
    const md = "line with break  \n---\n***\n**bold** text\n*italic* text\n-5 degrees\n```c\n#include <x>\n-flag \n```\n";
    expect(rules(md)).toEqual([]);
  });

  it("returns nothing for empty documents", () => {
    expect(lintMarkdown("  \n")).toEqual([]);
  });
});
