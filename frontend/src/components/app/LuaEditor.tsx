import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then",
  "true", "until", "while",
]);

const BUILTINS = new Set([
  "redis", "KEYS", "ARGV", "cjson", "cmsgpack", "struct", "bit", "tonumber",
  "tostring", "type", "ipairs", "pairs", "next", "table", "string", "math",
  "os", "unpack", "select", "error", "pcall", "xpcall", "assert", "setmetatable",
  "getmetatable", "rawget", "rawset", "rawequal", "tostring", "print",
]);

const TOKEN =
  /(--\[\[[\s\S]*?\]\]|--[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)|([{}()[\];,.:=+\-*/%<>~#]+)/g;

/** Renders Lua source with lightweight syntax highlighting. */
export function HighlightLua({ code }: { code: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code)) !== null) {
    if (m.index > last) nodes.push(code.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <span key={key++} className="text-muted-foreground italic">
          {m[1]}
        </span>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <span key={key++} className="text-amber-600 dark:text-amber-400">
          {m[2]}
        </span>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <span key={key++} className="text-violet-600 dark:text-violet-400">
          {m[3]}
        </span>,
      );
    } else if (m[4] !== undefined) {
      const word = m[4];
      if (KEYWORDS.has(word)) {
        nodes.push(
          <span key={key++} className="font-medium text-sky-600 dark:text-sky-400">
            {word}
          </span>,
        );
      } else if (BUILTINS.has(word)) {
        nodes.push(
          <span key={key++} className="text-emerald-600 dark:text-emerald-400">
            {word}
          </span>,
        );
      } else {
        nodes.push(<span key={key++}>{word}</span>);
      }
    } else if (m[5] !== undefined) {
      nodes.push(
        <span key={key++} className="text-muted-foreground">
          {m[5]}
        </span>,
      );
    }
    last = TOKEN.lastIndex;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return <>{nodes}</>;
}

/** Multiline code editor: a transparent textarea over a highlighted overlay. */
export function LuaEditor({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const sync = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const shared =
    "p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words";

  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden rounded-md border",
        className,
      )}
    >
      <pre
        ref={preRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-auto text-foreground",
          shared,
        )}
      >
        <HighlightLua code={value} />
        {"\n"}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        spellCheck={false}
        placeholder={placeholder}
        className={cn(
          "scrollbar-thin absolute inset-0 h-full w-full resize-none bg-transparent text-transparent caret-foreground outline-none",
          shared,
        )}
      />
    </div>
  );
}
