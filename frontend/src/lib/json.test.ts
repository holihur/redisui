import { describe, expect, it } from "vitest";
import { tryFormatJson } from "./json";

describe("tryFormatJson", () => {
  it("formats JSON objects", () => {
    expect(tryFormatJson('{"a":1,"b":[2,3]}')).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    );
  });

  it("formats JSON arrays", () => {
    expect(tryFormatJson("[1,2]")).toBe("[\n  1,\n  2\n]");
  });

  it("ignores non-object values", () => {
    expect(tryFormatJson("123")).toBeNull();
    expect(tryFormatJson('"just a string"')).toBeNull();
    expect(tryFormatJson("hello world")).toBeNull();
  });

  it("ignores invalid JSON", () => {
    expect(tryFormatJson("{not json}")).toBeNull();
  });

  it("ignores non-strings", () => {
    expect(tryFormatJson(null)).toBeNull();
    expect(tryFormatJson({ a: 1 })).toBeNull();
  });
});
