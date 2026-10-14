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
import { useI18n } from "@/lib/i18n";
import type { ClientInfo } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const COLUMNS = [
  "id",
  "addr",
  "name",
  "db",
  "age",
  "idle",
  "cmd",
  "user",
] as const;

export function ClientsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const { t } = useI18n();
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.clients(session.id, activeDb);
      setClients(res.clients ?? []);
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
          <DialogTitle>{t("Connected clients")}</DialogTitle>
          <DialogDescription>
            {t("Output of CLIENT LIST.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t(clients.length === 1 ? "{count} client" : "{count} clients", {
              count: clients.length,
            })}
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
            {t("Refresh")}
          </Button>
        </div>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <ScrollArea className="h-[55svh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                <tr className="border-b">
                  {COLUMNS.map((c) => (
                    <th key={c} className="px-2 py-1.5 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((row, i) => (
                  <tr key={row.id ?? i} className="border-b last:border-0">
                    {COLUMNS.map((c) => (
                      <td
                        key={c}
                        className="max-w-[16rem] truncate px-2 py-1.5 font-mono"
                        title={row[c] ?? ""}
                      >
                        {row[c] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
