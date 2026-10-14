import type { KeyInfo } from "./types";

export interface TreeNode {
  /** Display name for this level (the trailing `:`-separated segment). */
  segment: string;
  /** Full key prefix up to and including this segment. */
  path: string;
  children: TreeNode[];
  /** Present when a key exists exactly at `path` (may coexist with children). */
  key?: KeyInfo;
  /** Number of keys in this subtree. */
  count: number;
}

/** Build a `:`-delimited namespace tree from a flat list of keys. */
export function buildKeyTree(keys: KeyInfo[]): TreeNode {
  const root: TreeNode = { segment: "", path: "", children: [], count: 0 };
  const childMaps = new Map<TreeNode, Map<string, TreeNode>>();
  const mapFor = (node: TreeNode) => {
    let m = childMaps.get(node);
    if (!m) {
      m = new Map();
      childMaps.set(node, m);
    }
    return m;
  };

  for (const info of keys) {
    const parts = info.key.split(":");
    let node = root;
    root.count += 1;
    let path = "";
    for (const part of parts) {
      path = path ? `${path}:${part}` : part;
      const map = mapFor(node);
      let child = map.get(part);
      if (!child) {
        child = { segment: part, path, children: [], count: 0 };
        map.set(part, child);
        node.children.push(child);
      }
      child.count += 1;
      node = child;
    }
    node.key = info;
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) =>
    a.segment.localeCompare(b.segment, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  for (const child of node.children) sortTree(child);
}

/** Leaves-only single-child chains are expanded by default to reduce clicks. */
export function defaultOpen(node: TreeNode): boolean {
  return !node.key && node.children.length === 1;
}

/** Collect every expandable path in the tree (used by expand/collapse all). */
export function collectExpandablePaths(root: TreeNode): string[] {
  const out: string[] = [];
  const walk = (node: TreeNode) => {
    if (node.children.length > 0) {
      if (node.path) out.push(node.path);
      for (const child of node.children) walk(child);
    }
  };
  walk(root);
  return out;
}

export interface FlatNode {
  node: TreeNode;
  depth: number;
}

/**
 * Flatten the visible portion of the tree (respecting expansion state) into a
 * linear list so it can be virtualized.
 */
export function flattenTree(
  root: TreeNode,
  expanded: Record<string, boolean>,
): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of node.children) {
      out.push({ node: child, depth });
      if (child.children.length > 0 && (expanded[child.path] ?? defaultOpen(child))) {
        walk(child, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}
