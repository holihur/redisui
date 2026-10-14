import { useEffect, useRef, useState } from "react";
import { Eraser, Radar, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

interface MonitorLine {
  id: number;
  line: string;
  at: number;
}

const MAX_LINES = 1000;

export function MonitorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<MonitorLine[]>([]);
  const [filter, setFilter] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stop = () => {
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
  };

  useEffect(() => {
    if (!open) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => esRef.current?.close(), []);

  const start = () => {
    if (!session) return;
    stop();
    const es = new EventSource(api.monitorUrl(session.id, activeDb));
    es.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          line: string;
          at: number;
        };
        setLines((prev) =>
          [
            { id: ++idRef.current, line: data.line, at: data.at },
            ...prev,
          ].slice(0, MAX_LINES),
        );
      } catch {
        // ignore
      }
    });
    esRef.current = es;
    setRunning(true);
  };

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? lines.filter((l) => l.line.toLowerCase().includes(needle))
    : lines;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Profiler (MONITOR)</DialogTitle>
          <DialogDescription>
            Streams every command the server processes. Use with care on busy
            servers (db{activeDb}).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="destructive" size="sm" onClick={stop}>
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={start}>
              <Radar className="size-3.5" />
              Start
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines([])}
            disabled={lines.length === 0}
          >
            <Eraser className="size-3.5" />
            Clear
          </Button>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="h-8 w-40 font-mono text-xs"
          />
          <span className="ml-auto text-xs text-muted-foreground">
            {running ? "Monitoring…" : "Stopped"} · {visible.length} lines
          </span>
        </div>

        <div
          ref={scrollRef}
          className="scrollbar-thin h-[52svh] overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
        >
          {visible.length === 0 ? (
            <p className="px-1 py-2 text-muted-foreground">No commands yet.</p>
          ) : (
            visible.map((l) => (
              <div key={l.id} className="whitespace-pre-wrap break-all">
                {l.line}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
