import { useEffect, useMemo, useRef, useState } from "react";
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
import { CommandInput, HighlightLine } from "./CommandInput";
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

const HISTORY_KEY = "redisui.cmdHistory";

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function CommandConsole() {
  const open = useAppStore((s) => s.consoleOpen);
  const setOpen = useAppStore((s) => s.setConsoleOpen);
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const databases = useAppStore((s) => s.databases);
  const afterMutation = useAppStore((s) => s.afterMutation);
  const keys = useAppStore((s) => s.keys);
  const { t } = useI18n();

  const [commands, setCommands] = useState<string[]>([]);

  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [db, setDb] = useState(activeDb);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDb(activeDb), [activeDb]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    } catch {
      // ignore
    }
  }, [history]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api
      .commands(session.id, activeDb)
      .then((r) => {
        if (!cancelled) setCommands((r.commands ?? []).map((c) => c.name));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, activeDb]);

  const keyNames = useMemo(() => keys.map((k) => k.key), [keys]);

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
    setHistory((h) => [command, ...h.filter((x) => x !== command)].slice(0, 100));
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
                <span className="break-all">
                  <HighlightLine line={entry.command} />
                </span>
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

        <CommandInput
          value={input}
          onChange={setInput}
          onSubmit={() => void run()}
          commands={commands}
          keys={keyNames}
          history={history}
          placeholder="GET mykey"
          disabled={!session}
        />

        <Button size="sm" onClick={() => void run()} disabled={!session}>
          <Play className="size-3.5" />
          {t("Run")}
        </Button>
      </div>
    </section>
  );
}
