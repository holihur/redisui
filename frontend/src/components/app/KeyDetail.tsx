import { useState } from "react";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatBytes, formatTTL, typeColor } from "@/lib/format";
import type { Mutation } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { StringValue } from "./detail/StringValue";
import { HashValue } from "./detail/HashValue";
import { ListValue } from "./detail/ListValue";
import { SetValue } from "./detail/SetValue";
import { ZSetValue } from "./detail/ZSetValue";
import { StreamValue } from "./detail/StreamValue";

export function KeyDetail() {
  const selectedKey = useAppStore((s) => s.selectedKey);
  const detail = useAppStore((s) => s.keyDetail);
  const loading = useAppStore((s) => s.detailLoading);
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const loadMoreDetail = useAppStore((s) => s.loadMoreDetail);
  const selectKey = useAppStore((s) => s.selectKey);
  const afterMutation = useAppStore((s) => s.afterMutation);

  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [ttlOpen, setTtlOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [ttlValue, setTtlValue] = useState("");

  if (!selectedKey) return null;

  const mutate = async (m: Partial<Mutation>) => {
    if (!session) return;
    setBusy(true);
    try {
      await api.mutate(session.id, {
        db: activeDb,
        key: selectedKey,
        type: detail?.type,
        ...m,
      } as Mutation);
      await refreshKey();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!session || !renameValue.trim()) return;
    const next = renameValue.trim();
    setBusy(true);
    try {
      await api.mutate(session.id, {
        db: activeDb,
        key: selectedKey,
        action: "rename",
        newKey: next,
      });
      toast.success(`Renamed to “${next}”`);
      setRenameOpen(false);
      await selectKey(next);
      await afterMutation();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleTtl = async (persist: boolean) => {
    await mutate(
      persist
        ? { action: "persist" }
        : { action: "expire", ttl: Number(ttlValue) || 0 },
    );
    setTtlOpen(false);
  };

  const handleDelete = async () => {
    if (!session) return;
    try {
      await api.deleteKey(session.id, activeDb, selectedKey);
      toast.success(`Deleted “${selectedKey}”`);
      await selectKey(null);
      await afterMutation();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteOpen(false);
    }
  };

  const renderBody = () => {
    if (loading || !detail) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    const props = { detail, busy, mutate };
    switch (detail.type) {
      case "string":
        return <StringValue {...props} />;
      case "hash":
        return <HashValue {...props} />;
      case "list":
        return <ListValue {...props} />;
      case "set":
        return <SetValue {...props} />;
      case "zset":
        return <ZSetValue {...props} />;
      case "stream":
        return <StreamValue {...props} />;
      default:
        return (
          <pre className="scrollbar-thin flex-1 overflow-auto p-3 font-mono text-xs">
            {JSON.stringify(detail.value, null, 2)}
          </pre>
        );
    }
  };

  return (
    <section className="flex w-full shrink-0 flex-col border-t bg-card md:w-[32rem] md:max-w-[50%] md:border-t-0 md:border-l">
      <div className="flex shrink-0 items-start gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="mt-0.5 shrink-0 md:hidden"
          title="Back to keys"
          onClick={() => void selectKey(null)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-mono text-sm font-medium"
              title={selectedKey}
            >
              {selectedKey}
            </span>
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[10px]", typeColor(detail?.type ?? "none"))}
            >
              {detail?.type ?? "…"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {detail ? (
              <>
                <span>len {detail.length}</span>
                <span>{formatBytes(detail.size)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatTTL(detail.ttl)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refreshKey()}
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Rename"
            onClick={() => {
              setRenameValue(selectedKey);
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Set TTL"
            onClick={() => {
              setTtlValue(detail && detail.ttl > 0 ? String(detail.ttl) : "");
              setTtlOpen(true);
            }}
          >
            <Clock className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Delete key"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Close"
            onClick={() => void selectKey(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {renderBody()}

      {detail && detail.cursor !== 0 ? (
        <div className="flex shrink-0 items-center justify-center border-t px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadMoreDetail()}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Load more ({detail.length - (Array.isArray(detail.value) ? detail.value.length : 0)} remaining)
          </Button>
        </div>
      ) : null}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename key</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rename-key">New key name</Label>
            <Input
              id="rename-key"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void handleRename()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ttlOpen} onOpenChange={setTtlOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expiration</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ttl-value">TTL (seconds)</Label>
            <Input
              id="ttl-value"
              value={ttlValue}
              onChange={(e) => setTtlValue(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 3600"
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void handleTtl(true)}
              disabled={busy}
            >
              Remove expiration
            </Button>
            <Button onClick={() => void handleTtl(false)} disabled={busy}>
              Set expiration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete key?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono">
              {selectedKey}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
