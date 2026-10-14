import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Folder, FolderOpen, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBytes, formatTTL, typeColor, typeLabel } from "@/lib/format";
import {
  defaultOpen,
  flattenTree,
  type FlatNode,
  type TreeNode,
} from "@/lib/keytree";

interface KeyTreeProps {
  root: TreeNode;
  expanded: Record<string, boolean>;
  onToggle: (path: string, open: boolean) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

/**
 * Virtualized key tree: only the visible rows are mounted, so large key sets
 * stay responsive even after expanding many namespaces.
 */
export function KeyTree({
  root,
  expanded,
  onToggle,
  selectedKey,
  onSelect,
}: KeyTreeProps) {
  const flat = useMemo(() => flattenTree(root, expanded), [root, expanded]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });

  return (
    <div
      ref={parentRef}
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = flat[virtualRow.index];
          return (
            <div
              key={item.node.path}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <KeyTreeRow
                item={item}
                expanded={expanded}
                onToggle={onToggle}
                selectedKey={selectedKey}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KeyTreeRowProps {
  item: FlatNode;
  expanded: Record<string, boolean>;
  onToggle: (path: string, open: boolean) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

function KeyTreeRow({
  item,
  expanded,
  onToggle,
  selectedKey,
  onSelect,
}: KeyTreeRowProps) {
  const { node, depth } = item;
  const hasChildren = node.children.length > 0;
  const isLeaf = !!node.key;
  const open = expanded[node.path] ?? defaultOpen(node);
  const isSelected = isLeaf && selectedKey === node.key!.key;
  const label = node.segment === "" ? "(empty)" : node.segment;

  const activate = () => {
    if (isLeaf) onSelect(node.key!.key);
    else if (hasChildren) onToggle(node.path, !open);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      className={cn(
        "flex h-7 cursor-pointer items-center text-xs transition-colors hover:bg-accent/50",
        isSelected && "bg-accent hover:bg-accent",
      )}
      style={{ paddingLeft: depth * 14 }}
    >
      {hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path, !open);
          }}
          className="flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
          />
        </button>
      ) : (
        <span className="size-6 shrink-0" />
      )}

      {hasChildren ? (
        open ? (
          <FolderOpen className="mr-1.5 size-3.5 shrink-0 text-amber-500" />
        ) : (
          <Folder className="mr-1.5 size-3.5 shrink-0 text-amber-500" />
        )
      ) : (
        <KeyRound className="mr-1.5 size-3.5 shrink-0 text-muted-foreground" />
      )}

      <span
        title={node.path}
        className={cn(
          "min-w-0 flex-1 truncate font-mono",
          hasChildren && !isLeaf && "font-medium",
        )}
      >
        {label}
        {hasChildren && !isLeaf ? (
          <span className="text-muted-foreground">/</span>
        ) : null}
      </span>

      <span className="flex shrink-0 items-center gap-2 pr-3 pl-2">
        {isLeaf ? (
          <>
            <Badge
              variant="outline"
              className={cn(
                "hidden text-[10px] sm:inline-flex",
                typeColor(node.key!.type),
              )}
            >
              {typeLabel(node.key!.type)}
            </Badge>
            <span className="hidden w-12 text-right font-mono text-[10px] text-muted-foreground sm:inline">
              {formatTTL(node.key!.ttl)}
            </span>
            <span className="hidden w-12 text-right font-mono text-[10px] text-muted-foreground sm:inline">
              {formatBytes(node.key!.size)}
            </span>
          </>
        ) : null}
        {hasChildren ? (
          <Badge
            variant="secondary"
            className="h-4 px-1.5 font-mono text-[10px] text-muted-foreground"
          >
            {node.count}
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
