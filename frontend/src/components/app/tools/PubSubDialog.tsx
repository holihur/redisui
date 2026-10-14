import { useEffect, useRef, useState } from "react";
import { Eraser, Radio, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { PubSubEvent } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

interface StreamedMessage {
  id: number;
  channel: string;
  pattern?: string;
  payload: string;
  at: number;
}

const MAX_MESSAGES = 500;

export function PubSubDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const { t } = useI18n();
  const [channels, setChannels] = useState("");
  const [patterns, setPatterns] = useState("");
  const [pubChannel, setPubChannel] = useState("");
  const [pubPayload, setPubPayload] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<StreamedMessage[]>([]);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages]);

  const start = () => {
    if (!session) return;
    const ch = channels.split(",").map((s) => s.trim()).filter(Boolean);
    const pt = patterns.split(",").map((s) => s.trim()).filter(Boolean);
    if (ch.length === 0 && pt.length === 0) {
      toast.error(t("Add at least one channel or pattern"));
      return;
    }
    stop();
    const es = new EventSource(api.pubsubUrl(session.id, activeDb, ch, pt));
    es.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as PubSubEvent;
        setMessages((prev) =>
          [
            {
              id: ++idRef.current,
              channel: data.channel,
              pattern: data.pattern,
              payload: data.payload,
              at: Date.now(),
            },
            ...prev,
          ].slice(0, MAX_MESSAGES),
        );
      } catch {
        // ignore malformed frame
      }
    });
    es.onerror = () => {
      // The browser auto-reconnects; reflect the transient state only.
    };
    esRef.current = es;
    setRunning(true);
  };

  const publish = async () => {
    if (!session || !pubChannel.trim()) {
      toast.error("Enter a channel to publish to");
      return;
    }
    try {
      const res = await api.command(session.id, activeDb, "", [
        "PUBLISH",
        pubChannel.trim(),
        pubPayload,
      ]);
      if (res.ok) toast.success(t("Published to {channel}", { channel: pubChannel.trim() }));
      else toast.error(res.error ?? "Publish failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Pub/Sub monitor")}</DialogTitle>
          <DialogDescription>
            {t("Live subscription to channels and patterns (db{db}).", {
              db: activeDb,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ps-channels">{t("Channels")}</Label>
            <Input
              id="ps-channels"
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              placeholder="events, user:1"
              className="font-mono"
              disabled={running}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ps-patterns">{t("Patterns")}</Label>
            <Input
              id="ps-patterns"
              value={patterns}
              onChange={(e) => setPatterns(e.target.value)}
              placeholder="user:*"
              className="font-mono"
              disabled={running}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <Button variant="destructive" size="sm" onClick={stop}>
              <Square className="size-3.5" />
              {t("Stop")}
            </Button>
          ) : (
            <Button size="sm" onClick={start}>
              <Radio className="size-3.5" />
              {t("Subscribe")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMessages([])}
            disabled={messages.length === 0}
          >
            <Eraser className="size-3.5" />
            {t("Clear")}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {running ? t("Listening…") : t("Stopped")} ·{" "}
            {t("{count} messages", { count: messages.length })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">{t("Publish")}</span>
          <Input
            value={pubChannel}
            onChange={(e) => setPubChannel(e.target.value)}
            placeholder={t("channel")}
            className="h-8 w-36 font-mono text-xs"
          />
          <Input
            value={pubPayload}
            onChange={(e) => setPubPayload(e.target.value)}
            placeholder={t("message")}
            className="h-8 min-w-32 flex-1 font-mono text-xs"
          />
          <Button size="sm" variant="outline" onClick={() => void publish()}>
            <Send className="size-3.5" />
            {t("Publish")}
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="scrollbar-thin h-[48svh] overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px]"
        >
          {messages.length === 0 ? (
            <p className="px-1 py-2 text-muted-foreground">
              {t("No messages yet.")}
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="mb-1.5 border-b border-border/50 pb-1.5 last:border-0">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-[10px]">
                    {new Date(m.at).toLocaleTimeString()}
                  </span>
                  <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px]">
                    {m.channel}
                  </Badge>
                  {m.pattern ? (
                    <span className="text-[10px]">via {m.pattern}</span>
                  ) : null}
                </div>
                <pre className="mt-0.5 whitespace-pre-wrap break-all">{m.payload}</pre>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
