import { useEffect, useState } from "react";
import { Code2, Loader2, Play, Save, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LuaEditor } from "./LuaEditor";
import { JsonHighlight } from "./detail/JsonHighlight";
import { api } from "@/lib/api";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

const LIB_KEY = "redisui.luaScripts";

interface Saved {
  name: string;
  script: string;
  keys: string;
  args: string;
  sha?: string;
  loadedFor?: string;
}

function loadLibrary(): Saved[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

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

export function ScriptPanel() {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const setOpen = useAppStore((s) => s.setScriptPanelOpen);
  const detailWidth = useAppStore((s) => s.detailWidth);
  const isDesktop = useIsDesktop();
  const { t } = useI18n();

  const [library, setLibrary] = useState<Saved[]>(loadLibrary);
  const [name, setName] = useState("");
  const [script, setScript] = useState(TEMPLATE);
  const [keys, setKeys] = useState("");
  const [args, setArgs] = useState("");
  const [sha, setSha] = useState("");
  const [result, setResult] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LIB_KEY, JSON.stringify(library));
    } catch {
      // ignore
    }
  }, [library]);

  const current = () => library.find((s) => s.name === name);

  const selectSaved = (n: string) => {
    const s = library.find((x) => x.name === n);
    if (!s) return;
    setName(s.name);
    setScript(s.script);
    setKeys(s.keys);
    setArgs(s.args);
    setSha(s.sha ?? "");
  };

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast.error(t("Script name is required"));
      return;
    }
    setLibrary((lib) => {
      const entry: Saved = { name: n, script, keys, args, sha, loadedFor: sha ? script : undefined };
      const idx = lib.findIndex((s) => s.name === n);
      if (idx >= 0) {
        const next = [...lib];
        next[idx] = entry;
        return next;
      }
      return [...lib, entry];
    });
    toast.success(t("Script saved"));
  };

  const remove = () => {
    if (!name.trim()) return;
    setLibrary((lib) => lib.filter((s) => s.name !== name.trim()));
    setName("");
    setSha("");
    toast.success(t("Script deleted"));
  };

  const load = async () => {
    if (!session || !script.trim()) return;
    setBusy(true);
    try {
      const res = await api.scriptLoad(session.id, activeDb, script);
      setSha(res.sha);
      const n = name.trim();
      if (n) {
        setLibrary((lib) =>
          lib.map((s) =>
            s.name === n ? { ...s, sha: res.sha, loadedFor: script } : s,
          ),
        );
      }
      toast.success(t("Loaded SHA: {sha}", { sha: res.sha }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!session) return;
    if (!script.trim()) {
      toast.error(t("Script is required"));
      return;
    }
    setBusy(true);
    setResult(undefined);
    const entry = current();
    const useSha = entry?.sha && entry.loadedFor === script ? entry.sha : undefined;
    try {
      const res = await api.evalScript(session.id, {
        db: activeDb,
        script,
        sha: useSha,
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

  return (
    <section
      className="flex w-full shrink-0 flex-col border-t bg-card md:max-w-none md:border-t-0 md:border-l"
      style={isDesktop ? { width: detailWidth } : undefined}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Code2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("Lua script")}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          title={t("Close")}
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <select
          value={name}
          onChange={(e) => selectSaved(e.target.value)}
          className="h-8 w-40 rounded-md border bg-transparent px-2 font-mono text-xs outline-none"
        >
          <option value="">{t("Saved scripts")}</option>
          {library.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("Script name")}
          className="h-8 w-40 font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={save}>
          <Save className="size-3.5" />
          {t("Save")}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("Delete")}
          disabled={!name.trim()}
          onClick={remove}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>

      <LuaEditor
        value={script}
        onChange={setScript}
        placeholder="return 1"
        className="m-2 min-h-40 flex-1"
      />

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t p-2">
        <div className="grid gap-1">
          <Label htmlFor="lua-keys" className="text-[11px]">
            {t("Keys (one per line)")}
          </Label>
          <Textarea
            id="lua-keys"
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            className="min-h-14 font-mono text-xs"
            placeholder="mykey"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="lua-args" className="text-[11px]">
            {t("Arguments (one per line)")}
          </Label>
          <Textarea
            id="lua-args"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            className="min-h-14 font-mono text-xs"
            placeholder="arg1"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t p-2">
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
          <span className="truncate font-mono text-[11px] text-muted-foreground" title={sha}>
            SHA: {sha.slice(0, 12)}…
          </span>
        ) : null}
      </div>

      <div className={cn("min-h-24 shrink-0 overflow-auto border-t p-2")}>
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
    </section>
  );
}
