import { describe, expect, it } from "vitest";
import { applyStructure, chunk, planStructure, type BlockLabel } from "../src/structure";

/** Apply labels given in candidate order. */
function format(text: string, labels: BlockLabel[]): string {
  const plan = planStructure(text);
  const map = new Map<number, BlockLabel>();
  plan.candidates.forEach((idx, k) => map.set(idx, labels[k] ?? "paragraph"));
  return applyStructure(plan, map);
}

const words = (s: string) =>
  s.replace(/^\s*(#{1,6} |- |\d+\. |> )/gm, "").replace(/[•▪●–]|\(\d+\)/g, "").split(/\s+/).filter(Boolean);

describe("planStructure", () => {
  it("only asks the AI about plain lines", () => {
    const text = "Titel\n\n# Schon Markdown\n- schon Liste\n• Glyph-Punkt\n(2) Klammer\n```\nCode\n```\n| a | b |\nText";
    const plan = planStructure(text);
    expect(plan.candidates.map((i) => plan.lines[i])).toEqual(["Titel", "Text"]);
    expect(plan.kinds[4]).toBe("bullet");
    expect(plan.kinds[5]).toBe("numbered");
    expect(plan.kinds[7]).toBe("keep"); // inside code block
  });
});

describe("applyStructure", () => {
  it("builds headings, lists and paragraphs with the needed blank lines", () => {
    const text = [
      "Einkaufsliste",
      "Für das Wochenende brauchen wir einiges.",
      "Milch",
      "Brot",
      "Eier",
      "Danach kochen wir.",
      "Zuerst Wasser aufsetzen",
      "Dann Nudeln rein",
    ].join("\n");
    const out = format(text, ["heading1", "paragraph", "bullet", "bullet", "bullet", "paragraph", "numbered", "numbered"]);
    expect(out).toBe([
      "# Einkaufsliste",
      "",
      "Für das Wochenende brauchen wir einiges.",
      "",
      "- Milch",
      "- Brot",
      "- Eier",
      "",
      "Danach kochen wir.",
      "",
      "1. Zuerst Wasser aufsetzen",
      "2. Dann Nudeln rein",
    ].join("\n"));
  });

  it("never changes, drops or invents words", () => {
    const text = "Titel\nSatz eins. Satz zwei!\n• erster Punkt\n• zweiter Punkt\n(1) Schritt\nZitat hier\nweiter umbrochen\nohne Punkt";
    const labels: BlockLabel[] = ["heading2", "paragraph", "quote", "paragraph", "paragraph"];
    expect(words(format(text, labels))).toEqual(words(text));
  });

  it("keeps hard-wrapped paragraphs together but splits finished sentences", () => {
    expect(format("Ein langer Satz, der\nhier weitergeht.\nNeuer Absatz.", [])).toBe(
      "Ein langer Satz, der\nhier weitergeht.\n\nNeuer Absatz.",
    );
  });

  it("refuses headings that look like sentences", () => {
    expect(format("Das ist ein ganzer Satz.", ["heading1"])).toBe("Das ist ein ganzer Satz.");
    expect(format("x".repeat(90), ["heading2"])).toBe("x".repeat(90));
  });

  it("leaves existing Markdown and code untouched", () => {
    const text = "## Da\n- a\n- b\n\n```js\nconst x = 1\n```";
    expect(format(text, [])).toBe(text);
  });

  it("is idempotent", () => {
    const once = format("Titel\nMilch\nBrot", ["heading1", "bullet", "bullet"]);
    expect(format(once, [])).toBe(once);
  });
});

describe("chunk", () => {
  it("splits into fixed-size parts", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
