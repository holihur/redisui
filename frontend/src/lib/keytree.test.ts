import { describe, expect, it } from "vitest";
import {
  buildKeyTree,
  collectExpandablePaths,
  defaultOpen,
  flattenTree,
} from "./keytree";
import type { KeyInfo } from "./types";

const k = (key: string, type = "string"): KeyInfo => ({
  key,
  type,
  ttl: -1,
  size: 1,
});

describe("buildKeyTree", () => {
  it("groups keys by colon", () => {
    const root = buildKeyTree([
      k("user:1:name"),
      k("user:1:email"),
      k("user:2:name"),
      k("solo"),
    ]);
    expect(root.children.map((c) => c.segment)).toEqual(["solo", "user"]);
    const user = root.children.find((c) => c.segment === "user")!;
    expect(user.count).toBe(3);
    const one = user.children.find((c) => c.segment === "1")!;
    expect(one.count).toBe(2);
    expect(one.children.map((c) => c.segment)).toEqual(["email", "name"]);
  });

  it("keeps a key that is also a namespace", () => {
    const root = buildKeyTree([k("user"), k("user:1")]);
    const user = root.children.find((c) => c.segment === "user")!;
    expect(user.key?.key).toBe("user");
    expect(user.children.map((c) => c.segment)).toEqual(["1"]);
  });

  it("sorts numeric segments naturally", () => {
    const root = buildKeyTree([k("g:10"), k("g:2"), k("g:1")]);
    expect(root.children[0].children.map((c) => c.segment)).toEqual([
      "1",
      "2",
      "10",
    ]);
  });

  it("handles empty segments", () => {
    const root = buildKeyTree([k("a::b")]);
    const a = root.children[0];
    expect(a.children[0].segment).toBe("");
  });
});

describe("defaultOpen", () => {
  it("opens single-child chains that are not keys", () => {
    const root = buildKeyTree([k("a:b:c")]);
    expect(defaultOpen(root.children[0])).toBe(true);
  });

  it("keeps branching nodes closed", () => {
    const root = buildKeyTree([k("a:b"), k("a:c")]);
    expect(defaultOpen(root.children[0])).toBe(false);
  });
});

describe("flattenTree", () => {
  it("respects expansion state and reports depth", () => {
    const root = buildKeyTree([k("a:b"), k("a:c"), k("d")]);
    expect(flattenTree(root, {}).map((f) => f.node.segment)).toEqual([
      "a",
      "d",
    ]);

    const opened = flattenTree(root, { a: true });
    expect(opened.map((f) => f.node.segment)).toEqual(["a", "b", "c", "d"]);
    expect(opened.find((f) => f.node.segment === "b")!.depth).toBe(1);
  });
});

describe("collectExpandablePaths", () => {
  it("returns only paths that have children", () => {
    const root = buildKeyTree([k("a:b:c"), k("x")]);
    const paths = collectExpandablePaths(root);
    expect(paths).toContain("a");
    expect(paths).toContain("a:b");
    expect(paths).not.toContain("a:b:c");
  });
});
