import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ExportFile } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const [match, setMatch] = useState("*");
  const [limit, setLimit] = useState("1000");
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMatch("*");
      setLimit("1000");
    }
  }, [open]);

  const run = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const data = await api.exportKeys(
        session.id,
        activeDb,
        match || "*",
        Number(limit) || 1000,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `redisui-export-db${activeDb}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("Exported {count} keys", { count: data.exported }));
      onOpenChange(false);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Export keys")}</DialogTitle>
          <DialogDescription>
            {t("Dump matching keys (with TTLs) to a JSON file you can import later.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="export-match">{t("Pattern")}</Label>
            <Input
              id="export-match"
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              placeholder="user:*"
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="export-limit">{t("Max keys")}</Label>
            <Input
              id="export-limit"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {t("Export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const afterMutation = useAppStore((s) => s.afterMutation);
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(true);
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(null);
      setReplace(true);
    }
  }, [open]);

  const run = async () => {
    if (!session || !file) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as ExportFile;
      const keys = parsed.keys ?? [];
      if (keys.length === 0) {
        toast.error(t("No keys found in file"));
        return;
      }
      const res = await api.importKeys(session.id, activeDb, keys, replace);
      if (res.errors.length > 0) {
        toast.warning(t("Imported {count} keys", { count: res.imported }), {
          description: t("{failed} failed, e.g. {first}", {
            failed: res.errors.length,
            first: res.errors[0],
          }),
        });
      } else {
        toast.success(t("Imported {count} keys", { count: res.imported }));
      }
      await afterMutation();
      onOpenChange(false);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Import keys")}</DialogTitle>
          <DialogDescription>
            {t("Restore a previously exported JSON file into db{db}.", {
              db: activeDb,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="import-file">{t("Export file")}</Label>
            <Input
              id="import-file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={replace}
              onCheckedChange={(v) => setReplace(v === true)}
            />
            {t("Overwrite existing keys (RESTORE REPLACE)")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button disabled={busy || !file} onClick={() => void run()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {t("Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Bulk delete                                                                */
/* -------------------------------------------------------------------------- */

export function BulkDeleteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const afterMutation = useAppStore((s) => s.afterMutation);
  const [match, setMatch] = useState("");
  const [confirm, setConfirm] = useState("");
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMatch("");
      setConfirm("");
    }
  }, [open]);

  const run = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await api.bulkDelete(session.id, activeDb, match);
      toast.success(t("Deleted {count} keys", { count: res.deleted }));
      await afterMutation();
      onOpenChange(false);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {t("Delete keys by pattern")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Permanently delete every key in db{db} matching the pattern. This cannot be undone.",
              { db: activeDb },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bulk-match">{t("Pattern")}</Label>
            <Input
              id="bulk-match"
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              placeholder="temp:*"
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-confirm">
              {t("Type {pattern} to confirm", {
                pattern: match || t("the pattern"),
              })}
            </Label>
            <Input
              id="bulk-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !match || confirm !== match}
            onClick={() => void run()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Delete keys")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
