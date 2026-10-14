import { useState } from "react";
import { Code2, Loader2, Play, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonHighlight } from "@/components/app/detail/JsonHighlight";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/store/useAppStore";

const TEMPLATE = `-- KEYS / ARGV come from the fields below
local current = redis.call('GET', KEYS[1])
if not current then
  return nil
end
return current`;

const parseList = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function ScriptDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const { t } = useI18n();
  const [script, setScript] = useState(TEMPLATE);
  const [keys, setKeys] = useState("");
  const [args, setArgs] = useState("");
  const [result, setResult] = useState<unknown>(undefined);
  const [sha, setSha] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!session) return;
    if (!script.trim()) {
      toast.error(t("Script is required"));
      return;
    }
    setBusy(true);
    setResult(undefined);
    try {
      const res = await api.evalScript(session.id, {
        db: activeDb,
        script,
        keys: parseList(keys),
        args: parseList(args),
      });
      setResult(res.result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    if (!session || !script.trim()) return;
    setBusy(true);
    try {
      const res = await api.scriptLoad(session.id, activeDb, script);
      setSha(res.sha);
      toast.success(t("Loaded SHA: {sha}", { sha: res.sha }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="size-4" />
            {t("Lua script")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Run a Lua script with EVAL; KEYS and ARGV come from the fields below.",
            )}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          spellCheck={false}
          className="scrollbar-thin min-h-40 resize-y font-mono text-xs"
          placeholder="return 1"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="lua-keys">{t("Keys (one per line)")}</Label>
            <Textarea
              id="lua-keys"
              value={keys}
              onChange={(e) => setKeys(e.target.value)}
              className="min-h-16 font-mono text-xs"
              placeholder="mykey"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lua-args">{t("Arguments (one per line)")}</Label>
            <Textarea
              id="lua-args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="min-h-16 font-mono text-xs"
              placeholder="arg1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void run()}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {t("Run (EVAL)")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void load()}
          >
            <Upload className="size-3.5" />
            {t("Load (SCRIPT LOAD)")}
          </Button>
          {sha ? (
            <Input
              readOnly
              value={sha}
              className="h-8 max-w-xs font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : null}
        </div>

        <div className="min-h-24 rounded-md border bg-muted/20 p-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            {t("Result")}
          </p>
          {result === undefined ? (
            <p className="text-xs text-muted-foreground">{t("No output yet.")}</p>
          ) : typeof result === "string" ? (
            <pre className="font-mono text-xs whitespace-pre-wrap break-all">
              {result}
            </pre>
          ) : (
            <JsonHighlight value={JSON.stringify(result, null, 2) ?? "null"} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
