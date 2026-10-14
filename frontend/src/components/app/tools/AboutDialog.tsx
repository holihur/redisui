import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 text-xs last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const status = useAppStore((s) => s.updateStatus);
  const setStatus = useAppStore((s) => s.setUpdateStatus);
  const role = useAppStore((s) => s.role);
  const isAdmin = role === "admin";
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.updateStatus());
    } catch {
      // ignore
    }
  }, [setStatus]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const check = async () => {
    setBusy(true);
    try {
      const res = await api.updateCheck();
      setStatus(res.status);
      if (res.ok) {
        toast.success(
          res.status.updateAvailable
            ? `Update available: ${res.status.latest}`
            : "You're up to date",
        );
      } else {
        toast.error(res.error ?? "Update check failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    toast.loading("Downloading update…", { id: "update" });
    try {
      const res = await api.updateApply();
      if (!res.ok) {
        toast.error(res.error ?? "Update failed", { id: "update" });
        setBusy(false);
        return;
      }
      toast.success("Updated — restarting…", { id: "update" });
      setRestarting(true);
      // Poll health, then reload once the server is back.
      const deadline = Date.now() + 60_000;
      const poll = async () => {
        try {
          await api.health();
          window.location.reload();
        } catch {
          if (Date.now() < deadline) setTimeout(() => void poll(), 1500);
          else {
            toast.error("Server did not come back; refresh manually");
            setRestarting(false);
            setBusy(false);
          }
        }
      };
      setTimeout(() => void poll(), 2000);
    } catch {
      // The process may restart before the response arrives; treat as success.
      setRestarting(true);
      setTimeout(() => window.location.reload(), 6000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>About & updates</DialogTitle>
          <DialogDescription>
            Self-update checks GitHub releases and can apply them in place.
          </DialogDescription>
        </DialogHeader>

        {!status || status.enabled === false ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Self-update is disabled on this server.
          </p>
        ) : (
          <ScrollArea className="max-h-[60svh] pr-2">
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <Row label="Current version" value={status.current} />
                <Row
                  label="Latest version"
                  value={
                    status.latest ? (
                      <span className="inline-flex items-center gap-2">
                        {status.latest}
                        {status.updateAvailable ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-emerald-600 dark:text-emerald-400"
                          >
                            update available
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row
                  label="Auto-update"
                  value={status.autoApply ? "on" : "off"}
                />
                <Row
                  label="Check interval"
                  value={`${Math.round(status.intervalSeconds / 60)} min`}
                />
                <Row
                  label="Last checked"
                  value={
                    status.checkedAt
                      ? new Date(status.checkedAt).toLocaleTimeString()
                      : "never"
                  }
                />
                {status.lastError ? (
                  <Row
                    label="Last error"
                    value={
                      <span className="text-destructive">{status.lastError}</span>
                    }
                  />
                ) : null}
              </div>

              {status.notes ? (
                <div className="rounded-lg border p-3">
                  <p className="mb-1 text-xs font-medium">Release notes</p>
                  <pre className="max-h-40 overflow-auto font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                    {status.notes}
                  </pre>
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !isAdmin}
                  onClick={() => void check()}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Check for updates
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !isAdmin || !status.updateAvailable}
                  onClick={() => void apply()}
                >
                  {restarting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : status.updateAvailable ? (
                    <Download className="size-3.5" />
                  ) : (
                    <Rocket className="size-3.5" />
                  )}
                  {restarting ? "Restarting…" : "Update now"}
                </Button>
              </div>
              {!isAdmin ? (
                <p className="text-[11px] text-muted-foreground">
                  Only admins can trigger checks or updates.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
