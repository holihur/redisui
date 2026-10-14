import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AuditEvent } from "@/lib/types";

function statusClass(status: number): string {
  if (status < 300) return "text-emerald-600 dark:text-emerald-400";
  if (status < 400) return "text-sky-600 dark:text-sky-400";
  if (status < 500) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function AuditDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [buffered, setBuffered] = useState(0);
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAudit(200, actor);
      setEvents(res.events ?? []);
      setBuffered(res.buffered ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-4" />
            {t("Audit log")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Recent security-relevant API activity (mutations and authentication).",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            placeholder={t("Filter by actor…")}
            className="h-8 min-w-40 flex-1 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {t("Refresh")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("{count} events", { count: buffered })}
          </span>
        </div>

        <ScrollArea className="h-[58svh]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-1.5 font-medium">{t("Time")}</th>
                <th className="px-2 py-1.5 font-medium">{t("Actor")}</th>
                <th className="px-2 py-1.5 font-medium">{t("Role")}</th>
                <th className="px-2 py-1.5 font-medium">{t("Method")}</th>
                <th className="px-2 py-1.5 font-medium">{t("Path")}</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {t("Status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t("No audit events.")}
                  </td>
                </tr>
              ) : (
                events.map((e, i) => (
                  <tr key={`${e.time}-${i}`} className="border-b last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap font-mono text-muted-foreground">
                      {new Date(e.time).toLocaleTimeString()}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{e.actor}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">
                      {e.role || "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{e.method}</td>
                    <td className="px-2 py-1.5 font-mono break-all">{e.path}</td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right font-mono",
                        statusClass(e.status),
                      )}
                    >
                      {e.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
