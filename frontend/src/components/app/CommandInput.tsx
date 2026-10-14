import { useMemo, useRef, useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

const TOKEN_RE = /"[^"]*"?|'[^']*'?|\S+/g;

interface Piece {
  text: string;
  token: boolean;
}

function tokenize(line: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), token: false });
    out.push({ text: m[0], token: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), token: false });
  return out;
}

function classFor(text: string, index: number): string {
  if (index === 0) return "text-sky-600 dark:text-sky-400";
  if (/^["']/.test(text)) return "text-amber-600 dark:text-amber-400";
  if (/^-?\d+(\.\d+)?$/.test(text)) return "text-violet-600 dark:text-violet-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function currentToken(line: string): { index: number; prefix: string } {
  const endsWithSpace = /\s$/.test(line);
  const parts = line.match(TOKEN_RE) ?? [];
  if (endsWithSpace || parts.length === 0) return { index: parts.length, prefix: "" };
  return { index: parts.length - 1, prefix: parts[parts.length - 1].replace(/^["']/, "") };
}

function replaceToken(line: string, index: number, replacement: string): string {
  const parts = line.match(TOKEN_RE) ?? [];
  const before = parts.slice(0, index);
  const after = parts.slice(index + 1);
  const next = [...before, replacement, ...after];
  return next.join(" ") + (index === 0 ? " " : "");
}

/** Renders a command line with syntax highlighting. */
export function HighlightLine({ line }: { line: string }) {
  const pieces = tokenize(line);
  let idx = -1;
  return (
    <>
      {pieces.map((p, i) => {
        if (!p.token) return <span key={i}>{p.text}</span>;
        idx += 1;
        return (
          <span key={i} className={classFor(p.text, idx)}>
            {p.text}
          </span>
        );
      })}
    </>
  );
}

/** Highlighted Redis command input with command/key autocompletion and history. */
export function CommandInput({
  value,
  onChange,
  onSubmit,
  commands,
  keys,
  history,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  commands: string[];
  keys: string[];
  history: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"none" | "complete" | "history">("none");
  const inputRef = useRef<HTMLInputElement>(null);

  const { index, prefix } = currentToken(value);

  const completions = useMemo(() => {
    const p = prefix.toLowerCase();
    const source = index === 0 ? commands : keys;
    const out: string[] = [];
    for (const item of source) {
      if ((p === "" || item.toLowerCase().startsWith(p)) && item.toLowerCase() !== p) {
        out.push(item);
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [commands, keys, index, prefix]);

  const historyMatches = useMemo(() => {
    const p = prefix.toLowerCase();
    const out: string[] = [];
    for (const item of history) {
      if (p === "" || item.toLowerCase().startsWith(p)) {
        out.push(item);
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [history, prefix]);

  const showingHistory = mode === "history" && historyMatches.length > 0;
  const items = showingHistory ? historyMatches : mode === "complete" ? completions : [];
  const open = items.length > 0;
  const selected = Math.min(active, Math.max(0, items.length - 1));

  const close = () => {
    setMode("none");
    setActive(0);
  };

  const accept = (item: string) => {
    if (showingHistory) onChange(item);
    else onChange(replaceToken(value, index, item));
    close();
    inputRef.current?.focus();
  };

  const pieces = tokenize(value);
  let tokenIndex = -1;

  return (
    <div className="relative min-w-0 flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-md border border-transparent px-2.5 font-mono text-xs whitespace-pre"
      >
        {pieces.map((p, i) => {
          if (!p.token) return <span key={i}>{p.text}</span>;
          tokenIndex += 1;
          return (
            <span key={i} className={classFor(p.text, tokenIndex)}>
              {p.text}
            </span>
          );
        })}
      </div>

      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setMode(completions.length > 0 ? "complete" : "none");
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (open && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
            return;
          }
          if (open && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + items.length) % items.length);
            return;
          }
          if (open && (e.key === "Tab" || e.key === "Enter")) {
            e.preventDefault();
            accept(items[selected]);
            return;
          }
          if (e.key === "Escape") {
            close();
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            if (history.length > 0) {
              setMode("history");
              setActive(0);
            }
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="relative h-8 w-full rounded-md border bg-transparent px-2.5 font-mono text-xs text-transparent caret-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />

      {open ? (
        <div className="absolute bottom-9 left-0 z-20 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {showingHistory ? (
            <p className="px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              History
            </p>
          ) : null}
          {items.map((s, i) => (
            <button
              key={s + i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left font-mono text-xs",
                i === selected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              {showingHistory ? (
                <History className="size-3 shrink-0 text-muted-foreground" />
              ) : null}
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
