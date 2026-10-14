import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BarChart } from "@/components/app/charts/Chart";
import { formatBytes, typeColor } from "@/lib/format";
import type { MemoryReport } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const HIGHLIGHT = [
  "used_memory_human",
  "used_memory_peak_human",
  "used_memory_rss_human",
  "maxmemory_human",
  "mem_fragmentation_ratio",
  "mem_not_counted_for_evict",
];

export function MemoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const [report, setReport] = useState<MemoryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      setReport(await api.memoryReport(session.id, activeDb, 1000, 25));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session, activeDb]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Memory analysis</DialogTitle>
          <DialogDescription>
            Server memory usage and the largest keys found in a random sample.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <ScrollArea className="h-[60svh] pr-3">
            {report ? (
              <div className="space-y-4">
                {report.doctor ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                      <Activity className="size-3.5" />
                      MEMORY DOCTOR
                    </div>
                    <pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                      {report.doctor}
                    </pre>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-3 text-xs sm:grid-cols-3">
                  {HIGHLIGHT.filter((k) => report.info[k] !== undefined).map(
                    (k) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="truncate text-muted-foreground" title={k}>
                          {k}
                        </span>
                        <span className="font-mono">{report.info[k]}</span>
                      </div>
                    ),
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium">
                    Largest keys{" "}
                    <span className="font-normal text-muted-foreground">
                      (sampled {report.sampled})
                    </span>
                  </p>
                  <BarChart
                    className="mb-4"
                    bars={report.topKeys.map((k) => ({
                      label: k.key,
                      value: k.size,
                    }))}
                    formatValue={formatBytes}
                  />
                  <table className="w-full text-xs">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-2 py-1.5 font-medium">Key</th>
                        <th className="px-2 py-1.5 font-medium">Type</th>
                        <th className="px-2 py-1.5 text-right font-medium">
                          Size
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topKeys.map((k) => (
                        <tr key={k.key} className="border-b last:border-0">
                          <td className="max-w-0 px-2 py-1.5">
                            <span
                              className="block truncate font-mono"
                              title={k.key}
                            >
                              {k.key}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", typeColor(k.type))}
                            >
                              {k.type}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {formatBytes(k.size)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
