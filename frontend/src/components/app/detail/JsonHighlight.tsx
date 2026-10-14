import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tryFormatJson } from "@/lib/json";

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|([{}[\],])/g;

/** Lightweight JSON syntax highlighter (no external dependency). */
export function JsonHighlight({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  TOKEN.lastIndex = 0;

  while ((match = TOKEN.exec(value)) !== null) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index));

    if (match[1] !== undefined) {
      const isKey = match[2] !== undefined;
      nodes.push(
        <span
          key={key++}
          className={
            isKey
              ? "text-sky-600 dark:text-sky-400"
              : "text-emerald-600 dark:text-emerald-400"
          }
        >
          {match[1]}
        </span>,
      );
      if (match[2] !== undefined) {
        nodes.push(
          <span key={key++} className="text-muted-foreground">
            {match[2]}
          </span>,
        );
      }
    } else if (match[3] !== undefined) {
      nodes.push(
        <span key={key++} className="text-amber-600 dark:text-amber-400">
          {match[3]}
        </span>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <span key={key++} className="text-violet-600 dark:text-violet-400">
          {match[4]}
        </span>,
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <span key={key++} className="text-muted-foreground">
          {match[5]}
        </span>,
      );
    }
    lastIndex = TOKEN.lastIndex;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));

  return (
    <pre
      className={cn(
        "scrollbar-thin min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre",
        className,
      )}
    >
      {nodes}
    </pre>
  );
}
