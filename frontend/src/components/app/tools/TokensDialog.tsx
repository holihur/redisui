import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { Connection, PublicToken } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const SCOPES = ["read", "write", "admin"] as const;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ScopePicker({
  connections,
  selected,
  onChange,
}: {
  connections: Connection[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useI18n();
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((c) => c !== id)
        : [...selected, id],
    );
  return (
    <div className="grid gap-1 rounded-md border p-2">
      {connections.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("No connections defined")}
        </p>
      ) : (
        connections.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <Checkbox
              checked={selected.includes(c.id)}
              onCheckedChange={() => toggle(c.id)}
            />
            <span className="font-mono">{c.name}</span>
          </label>
        ))
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("Leave all unchecked to grant access to every connection.")}
      </p>
    </div>
  );
}

export function TokensDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<PublicToken[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    scopes: ["read"] as string[],
    connections: [] as string[],
    ttlHours: 0,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [tk, c] = await Promise.all([api.listTokens(), api.listConnections()]);
      setTokens(tk.tokens ?? []);
      setConnections(c);
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggleScope = (s: string) =>
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(s)
        ? f.scopes.filter((x) => x !== s)
        : [...f.scopes, s],
    }));

  const create = async () => {
    if (!form.name.trim()) {
      toast.error(t("Token name is required"));
      return;
    }
    if (form.scopes.length === 0) {
      toast.error(t("Select at least one scope"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.createToken({
        name: form.name.trim(),
        scopes: form.scopes,
        connections: form.connections,
        ttlHours: Number(form.ttlHours) || 0,
      });
      setCreated(res.token);
      setForm({ name: "", scopes: ["read"], connections: [], ttlHours: 0 });
      await load();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteToken(id);
      toast.success(t("Token deleted"));
      await load();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("Copied"));
    } catch {
      toast.error(t("Copy failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {t("Access tokens")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Personal access tokens for automation and the MCP endpoint. Scopes: read, write, admin.",
            )}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <ScrollArea className="max-h-[70svh] pr-2">
            <div className="space-y-5">
              {created ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                  <p className="mb-1 text-xs font-medium">
                    {t("New token (shown once)")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={created} className="h-8 font-mono text-xs" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void copy(created)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                  <Plus className="size-3.5" />
                  {t("New token")}
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  <div className="grid gap-2">
                    <Label htmlFor="tok-name">{t("Name")}</Label>
                    <Input
                      id="tok-name"
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="ci-deploy"
                      className="h-8"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tok-ttl">{t("TTL (hours, 0 = never)")}</Label>
                    <Input
                      id="tok-ttl"
                      value={String(form.ttlHours)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ttlHours: Number(e.target.value) || 0 }))
                      }
                      inputMode="numeric"
                      className="h-8 font-mono"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <Label className="mb-1 block text-xs">{t("Scopes")}</Label>
                  <div className="flex flex-wrap gap-3">
                    {SCOPES.map((s) => (
                      <label
                        key={s}
                        className="flex cursor-pointer items-center gap-2 text-xs"
                      >
                        <Checkbox
                          checked={form.scopes.includes(s)}
                          onCheckedChange={() => toggleScope(s)}
                        />
                        <span className="font-mono">{s}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <Label className="mb-1 block text-xs">
                    {t("Connection scope")}
                  </Label>
                  <ScopePicker
                    connections={connections}
                    selected={form.connections}
                    onChange={(next) =>
                      setForm((f) => ({ ...f, connections: next }))
                    }
                  />
                </div>

                <div className="mt-3 flex justify-end">
                  <Button size="sm" disabled={busy} onClick={() => void create()}>
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    {t("Create token")}
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium">
                  {t("{count} tokens", { count: tokens.length })}
                </p>
                <div className="space-y-2">
                  {tokens.map((tok) => (
                    <div key={tok.id} className="rounded-lg border p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{tok.name}</span>
                        <span className="font-mono text-muted-foreground">
                          {tok.prefix}…
                        </span>
                        {tok.scopes.map((s) => (
                          <Badge
                            key={s}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {s}
                          </Badge>
                        ))}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto"
                          title={t("Delete token")}
                          onClick={() => void remove(tok.id)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                        <span>
                          {t("Created")}: {new Date(tok.createdAt).toLocaleString()}
                        </span>
                        {tok.expiresAt ? (
                          <span>
                            {t("Expires")}:{" "}
                            {new Date(tok.expiresAt).toLocaleString()}
                          </span>
                        ) : null}
                        {tok.lastUsedAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Check className="size-3" />
                            {t("Last used")}:{" "}
                            {new Date(tok.lastUsedAt).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
