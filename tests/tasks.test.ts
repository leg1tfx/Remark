import { describe, expect, it } from "vitest";
import { findTaskLines, setTaskChecked } from "../src/tasks";

describe("findTaskLines", () => {
  it("finds tasks with all list markers and skips code blocks", () => {
    const md = [
      "- [ ] one",       // 0
      "* [x] two",       // 1
      "+ [X] three",     // 2
      "1. [ ] four",     // 3
      "```",             // 4
      "- [ ] not a task",
      "```",
      "  - [ ] nested",  // 7
      "> - [ ] quoted",  // 8
      "- [] broken",
      "- [ ]no space",
    ].join("\n");
    expect(findTaskLines(md)).toEqual([0, 1, 2, 3, 7, 8]);
  });

  it("handles ~~~ fences and longer closing fences", () => {
    const md = "~~~\n- [ ] a\n~~~~\n- [ ] b";
    expect(findTaskLines(md)).toEqual([3]);
  });
});

describe("setTaskChecked", () => {
  it("toggles only the checkbox", () => {
    expect(setTaskChecked("- [ ] buy [ ] milk", true)).toBe("- [x] buy [ ] milk");
    expect(setTaskChecked("  1. [X] done", false)).toBe("  1. [ ] done");
  });
});
