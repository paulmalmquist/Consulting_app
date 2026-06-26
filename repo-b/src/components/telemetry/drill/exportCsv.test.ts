import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./exportCsv";

describe("csvCell", () => {
  it("passes scalars through", () => {
    expect(csvCell("cnn")).toBe("cnn");
    expect(csvCell(17.33)).toBe("17.33");
  });
  it("empty for null/undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes + escapes comma, quote, newline", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("JSON-stringifies object cells (value preserved)", () => {
    expect(csvCell({ rmse: 17.33 })).toBe('"{""rmse"":17.33}"');
  });
});

describe("toCsv", () => {
  it("builds header + rows in column order", () => {
    expect(toCsv(["a", "b"], [{ a: 1, b: 2 }, { a: 3, b: 4 }])).toBe("a,b\n1,2\n3,4");
  });
  it("header-only when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });
  it("missing keys become empty cells", () => {
    expect(toCsv(["a", "b"], [{ a: 1 }])).toBe("a,b\n1,");
  });
});
