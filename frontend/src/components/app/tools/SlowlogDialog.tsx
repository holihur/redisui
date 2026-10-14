import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { SlowlogEntry } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function SlowlogDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const [entries, setEntries] = useState<SlowlogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.slowlog(session.id, activeDb, 100);
      setEntries(res.entries ?? []);
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
      <DialogContent className="max-h-[85svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Slow log</DialogTitle>
          <DialogDescription>
            The most recent commands that exceeded the server's slowlog
            threshold (db{activeDb}).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </span>
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
          <ScrollArea className="h-[55svh]">
            {entries.length === 0 && !loading ? (
              <p className="py-10 text-center text-xs text-muted-foreground">
                No slow commands recorded.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-2 py-1.5 font-medium">Time</th>
                    <th className="px-2 py-1.5 font-medium">Duration</th>
                    <th className="px-2 py-1.5 font-medium">Command</th>
                    <th className="hidden px-2 py-1.5 font-medium sm:table-cell">
                      Client
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {new Date(e.timestamp * 1000).toLocaleTimeString()}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono">
                        {(e.durationMicros / 1000).toFixed(2)} ms
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-mono break-all">
                          {e.args.join(" ")}
                        </span>
                      </td>
                      <td className="hidden px-2 py-1.5 font-mono text-muted-foreground sm:table-cell">
                        {e.clientAddr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
