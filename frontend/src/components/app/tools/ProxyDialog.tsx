import { useEffect, useState } from "react";
import { Loader2, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineChart } from "@/components/app/charts/Chart";
import { api } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProxySnapshot } from "@/lib/types";

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("truncate text-sm", mono && "font-mono")} title={value}>
        {value}
      </p>
    </div>
  );
}

export function ProxyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [snap, setSnap] = useState<ProxySnapshot | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api.proxyStatus();
        if (!cancelled) setSnap(s);
      } catch {
        // ignore transient errors
      }
    };
    void load();
    const id = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open]);

  const series = snap?.series ?? [];
  const formatX = (x: number) => new Date(x).toLocaleTimeString();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="size-4" />
            {t("RESP proxy")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Transparent Redis protocol proxy: point other apps here to record uplink/downlink traffic.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!snap ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !snap.running ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t(
              "Proxy is disabled. Start the server with -proxy-addr and -proxy-target to enable it.",
            )}
          </p>
        ) : (
          <ScrollArea className="max-h-[70svh] pr-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label={t("Listen")} value={snap.addr ?? ""} mono />
                <Stat label={t("Target")} value={snap.target ?? ""} mono />
                <Stat
                  label={t("Active connections")}
                  value={String(snap.active ?? 0)}
                />
                <Stat
                  label={t("Total connections")}
                  value={String(snap.total ?? 0)}
                />
                <Stat label={t("Uplink")} value={formatBytes(snap.up ?? 0)} />
                <Stat label={t("Downlink")} value={formatBytes(snap.down ?? 0)} />
                <Stat label={t("Commands")} value={String(snap.commands ?? 0)} />
              </div>

              <div className="rounded-lg border p-2">
                <p className="mb-1 text-xs font-medium">
                  {t("Uplink (bytes/s)")}
                </p>
                <LineChart
                  points={series.map((b) => ({ x: b.t * 1000, y: b.up }))}
                  height={140}
                  formatX={formatX}
                  formatY={formatBytes}
                />
              </div>
              <div className="rounded-lg border p-2">
                <p className="mb-1 text-xs font-medium">
                  {t("Downlink (bytes/s)")}
                </p>
                <LineChart
                  points={series.map((b) => ({ x: b.t * 1000, y: b.down }))}
                  height={140}
                  formatX={formatX}
                  formatY={formatBytes}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium">
                  {t("Connections")}
                </p>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-2 py-1.5 font-medium">#</th>
                      <th className="px-2 py-1.5 font-medium">{t("Remote")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("Uptime")}</th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        {t("Uplink")}
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        {t("Downlink")}
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        {t("Commands")}
                      </th>
                      <th className="px-2 py-1.5 font-medium">
                        {t("Last command")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snap.conns ?? []).map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 font-mono">{c.id}</td>
                        <td className="px-2 py-1.5 font-mono">{c.remote}</td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">
                          {formatDuration(
                            Math.max(
                              0,
                              Math.floor(Date.now() / 1000) - c.startedAt,
                            ),
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {formatBytes(c.up)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {formatBytes(c.down)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {c.commands}
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px]"
                          >
                            {c.lastCommand || "—"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
