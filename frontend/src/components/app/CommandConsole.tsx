import { useEffect, useRef, useState } from "react";
import { ChevronDown, Eraser, Play, Terminal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

interface Entry {
  id: number;
  command: string;
  result?: unknown;
  error?: string;
  db: number;
  pending?: boolean;
}

export function CommandConsole() {
  const open = useAppStore((s) => s.consoleOpen);
  const setOpen = useAppStore((s) => s.setConsoleOpen);
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const databases = useAppStore((s) => s.databases);
  const afterMutation = useAppStore((s) => s.afterMutation);
  const { t } = useI18n();

  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [db, setDb] = useState(activeDb);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDb(activeDb), [activeDb]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const run = async () => {
    const command = input.trim();
    if (!command || !session) return;
    const id = ++idRef.current;
    setEntries((e) => [...e, { id, command, db, pending: true }]);
    setHistory((h) => [command, ...h].slice(0, 100));
    setHistoryIndex(-1);
    setInput("");
    try {
      const res = await api.command(session.id, db, command);
      setEntries((e) =>
        e.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                pending: false,
                result: res.result,
                error: res.ok ? undefined : res.error,
              }
            : entry,
        ),
      );
      if (res.ok) {
        const mutating =
          /^(set|del|hset|hdel|lpush|rpush|lset|lrem|sadd|srem|zadd|zrem|rename|expire|persist|flushdb|flushall|restore|append|incr|decr|mset|getset|setex|psetex)\b/i;
        if (mutating.test(command)) void afterMutation();
      }
    } catch (e) {
      setEntries((e2) =>
        e2.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                pending: false,
                error: e instanceof Error ? e.message : String(e),
              }
            : entry,
        ),
      );
    }
  };

  const renderResult = (entry: Entry) => {
    if (entry.pending) return "(running…)";
    if (entry.error) return entry.error;
    const { result } = entry;
    if (result === null || result === undefined) return "(nil)";
    if (typeof result === "string") return result || '""';
    return JSON.stringify(result);
  };

  return (
    <section
      className={cn(
        "flex shrink-0 flex-col border-t bg-card",
        open ? "h-64" : "hidden",
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
        <Terminal className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{t("Console")}</span>
        <Badge variant="secondary" className="font-mono text-[10px]">
          db{db}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("Clear")}
            onClick={() => setEntries([])}
          >
            <Eraser className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={t("Hide (Ctrl/Cmd+K)")}
            onClick={() => setOpen(false)}
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed"
      >
        {entries.length === 0 ? (
          <p className="px-1 py-2 text-muted-foreground">
            {t("Type a Redis command and press Enter. Use ↑/↓ for history.")}
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="mb-2">
              <div className="flex items-center gap-2">
                <ChevronDown className="size-3 text-muted-foreground" />
                <span className="text-sky-600 dark:text-sky-400">
                  db{entry.db}&gt;
                </span>
                <span className="break-all">{entry.command}</span>
              </div>
              <pre
                className={cn(
                  "mt-0.5 ml-5 whitespace-pre-wrap break-all",
                  entry.error
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {renderResult(entry)}
              </pre>
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t p-2">
        <Select value={String(db)} onValueChange={(v) => setDb(Number(v))}>
          <SelectTrigger size="sm" className="w-20 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {databases.length > 0 ? (
              databases.map((d) => (
                <SelectItem key={d.index} value={String(d.index)}>
                  db{d.index}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="0">db0</SelectItem>
            )}
          </SelectContent>
        </Select>

        <div className="relative min-w-0 flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void run();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (history.length === 0) return;
                const next = Math.min(historyIndex + 1, history.length - 1);
                setHistoryIndex(next);
                setInput(history[next]);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (historyIndex <= 0) {
                  setHistoryIndex(-1);
                  setInput("");
                  return;
                }
                const next = historyIndex - 1;
                setHistoryIndex(next);
                setInput(history[next]);
              }
            }}
            placeholder="GET mykey"
            spellCheck={false}
            className="h-8 w-full rounded-md border bg-transparent px-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <Button size="sm" onClick={() => void run()} disabled={!session}>
          <Play className="size-3.5" />
          {t("Run")}
        </Button>
      </div>
    </section>
  );
}
