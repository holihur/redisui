import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Connection, PublicUser } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const ROLES = ["admin", "operator", "viewer"] as const;
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
        <p className="text-xs text-muted-foreground">{t("No connections defined")}</p>
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

export function UsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentUser = useAppStore((s) => s.username);
  const { t } = useI18n();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "viewer",
    connections: [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [u, c] = await Promise.all([api.listUsers(), api.listConnections()]);
      setUsers(u.users ?? []);
      setConnections(c);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const create = async () => {
    if (!form.username.trim() || !form.password) {
      toast.error(t("Username and password are required"));
      return;
    }
    setBusy(true);
    try {
      await api.createUser({ ...form, username: form.username.trim() });
      toast.success(t("Created user {name}", { name: form.username.trim() }));
      setForm({ username: "", password: "", role: "viewer", connections: [] });
      await load();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (username: string, role: string) => {
    try {
      await api.updateUser(username, { role });
      toast.success(t("Updated {name}", { name: username }));
      await load();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const changeScope = async (user: PublicUser, connections: string[]) => {
    try {
      await api.updateUser(user.username, { connections });
      await load();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const remove = async (username: string) => {
    try {
      await api.deleteUser(username);
      toast.success(t("Deleted {name}", { name: username }));
      await load();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Users")}</DialogTitle>
          <DialogDescription>
            {t(
              "Local accounts with role-based access. Admins manage everything; operators read/write their connections; viewers are read-only.",
            )}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <ScrollArea className="max-h-[70svh] pr-2">
            <div className="space-y-5">
              <div className="rounded-lg border p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                  <UserPlus className="size-3.5" />
                  {t("New user")}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="username"
                    className="h-8"
                  />
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={t("password (min 6 chars)")}
                    className="h-8"
                    autoComplete="new-password"
                  />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div />
                </div>
                <div className="mt-2">
                  <Label className="mb-1 block text-xs">{t("Connection scope")}</Label>
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
                    {t("Create user")}
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium">
                  {t("{count} accounts", { count: users.length })}
                </p>
                <div className="space-y-2">
                  {loading && users.length === 0 ? (
                    <div className="flex h-16 items-center justify-center">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    users.map((u) => (
                      <div
                        key={u.username}
                        className="rounded-lg border p-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.username}</span>
                          {u.username === currentUser ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {t("you")}
                            </Badge>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2">
                            <Select
                              value={u.role}
                              onValueChange={(v) => void changeRole(u.username, v)}
                            >
                              <SelectTrigger size="sm" className="h-7 w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t("Delete user")}
                              disabled={u.username === currentUser}
                              onClick={() => void remove(u.username)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <ScopePicker
                            connections={connections}
                            selected={u.connections}
                            onChange={(next) => void changeScope(u, next)}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
