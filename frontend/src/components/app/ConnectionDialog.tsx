import { useEffect, useState } from "react";
import { Loader2, Plug, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Connection, ConnectionInput, SSHAuthMethod } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

interface FormState {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  db: string;
  tls: boolean;
  tlsVerify: boolean;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshAuthMethod: SSHAuthMethod;
  sshPassword: string;
  sshPrivateKey: string;
  sshPassphrase: string;
  sshFingerprint: string;
}

const emptyForm: FormState = {
  name: "",
  host: "127.0.0.1",
  port: "6379",
  username: "",
  password: "",
  db: "0",
  tls: false,
  tlsVerify: false,
  sshEnabled: false,
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshAuthMethod: "password",
  sshPassword: "",
  sshPrivateKey: "",
  sshPassphrase: "",
  sshFingerprint: "",
};

function fromConnection(c: Connection | null): FormState {
  if (!c) return { ...emptyForm };
  return {
    name: c.name,
    host: c.host,
    port: String(c.port || 6379),
    username: c.username ?? "",
    password: "",
    db: String(c.db ?? 0),
    tls: c.tls,
    tlsVerify: c.tlsVerify,
    sshEnabled: !!c.ssh?.enabled,
    sshHost: c.ssh?.host ?? "",
    sshPort: String(c.ssh?.port ?? 22),
    sshUser: c.ssh?.user ?? "",
    sshAuthMethod: c.ssh?.authMethod ?? "password",
    sshPassword: "",
    sshPrivateKey: "",
    sshPassphrase: "",
    sshFingerprint: c.ssh?.hostKeyFingerprint ?? "",
  };
}

export function ConnectionDialog() {
  const open = useAppStore((s) => s.connectionDialogOpen);
  const editing = useAppStore((s) => s.editingConnection);
  const close = useAppStore((s) => s.closeConnectionDialog);
  const loadConnections = useAppStore((s) => s.loadConnections);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) setForm(fromConnection(editing));
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const buildInput = (): ConnectionInput => ({
    name: form.name.trim(),
    host: form.host.trim(),
    port: Number(form.port) || 6379,
    username: form.username.trim() || undefined,
    password: form.password || undefined,
    db: Number(form.db) || 0,
    tls: form.tls,
    tlsVerify: form.tlsVerify,
    ssh: form.sshEnabled
      ? {
          enabled: true,
          host: form.sshHost.trim(),
          port: Number(form.sshPort) || 22,
          user: form.sshUser.trim(),
          authMethod: form.sshAuthMethod,
          password: form.sshPassword || undefined,
          privateKey: form.sshPrivateKey || undefined,
          passphrase: form.sshPassphrase || undefined,
          hostKeyFingerprint: form.sshFingerprint.trim() || undefined,
        }
      : undefined,
  });

  const handleTest = async () => {
    setTesting(true);
    const t = toast.loading("Testing connection…");
    try {
      const res = await api.testConnection({
        ...buildInput(),
        ...(editing ? { id: editing.id } : {}),
      });
      if (res.ok) toast.success("Connection successful", { id: t });
      else toast.error(res.error ?? "Connection failed", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id: t });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.host.trim()) {
      toast.error("Name and host are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.updateConnection(editing.id, buildInput());
        toast.success("Connection updated");
      } else {
        await api.createConnection(buildInput());
        toast.success("Connection created");
      }
      await loadConnections();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90svh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-4 sm:px-6">
          <DialogTitle>
            {editing ? "Edit connection" : "New connection"}
          </DialogTitle>
          <DialogDescription>
            Configure the Redis endpoint. Optionally route the connection
            through an SSH jump host.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin max-h-[calc(90svh-9rem)] overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="conn-name">Connection name</Label>
              <Input
                id="conn-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Production cache"
              />
            </div>

            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="grid gap-2">
                <Label htmlFor="conn-host">Host</Label>
                <Input
                  id="conn-host"
                  value={form.host}
                  onChange={(e) => set("host", e.target.value)}
                  placeholder="127.0.0.1"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="conn-port">Port</Label>
                <Input
                  id="conn-port"
                  value={form.port}
                  onChange={(e) => set("port", e.target.value)}
                  inputMode="numeric"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem]">
              <div className="grid gap-2">
                <Label htmlFor="conn-user">Username</Label>
                <Input
                  id="conn-user"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  placeholder="default"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="conn-pass">Password</Label>
                <Input
                  id="conn-pass"
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={editing?.hasAuth ? "•••• unchanged" : "optional"}
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="conn-db">Database</Label>
                <Input
                  id="conn-db"
                  value={form.db}
                  onChange={(e) => set("db", e.target.value)}
                  inputMode="numeric"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">Use TLS</span>
                    <span className="block text-xs text-muted-foreground">
                      Encrypt the connection to Redis (rediss://)
                    </span>
                  </span>
                </span>
                <Switch
                  checked={form.tls}
                  onCheckedChange={(v) => set("tls", v)}
                />
              </label>
              {form.tls ? (
                <label className="flex cursor-pointer items-center justify-between gap-3 border-t pt-3">
                  <span className="text-sm">
                    <span className="font-medium">Verify certificate</span>
                    <span className="block text-xs text-muted-foreground">
                      Validate the server certificate chain
                    </span>
                  </span>
                  <Switch
                    checked={form.tlsVerify}
                    onCheckedChange={(v) => set("tlsVerify", v)}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              SSH tunnel
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="rounded-lg border">
            <label className="flex cursor-pointer items-center justify-between gap-3 p-3">
              <span className="text-sm">
                <span className="font-medium">Connect over SSH</span>
                <span className="block text-xs text-muted-foreground">
                  Tunnel the Redis traffic through a jump host
                </span>
              </span>
              <Switch
                checked={form.sshEnabled}
                onCheckedChange={(v) => set("sshEnabled", v)}
              />
            </label>

            {form.sshEnabled ? (
              <div className="space-y-4 border-t p-3">
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ssh-host">SSH host</Label>
                    <Input
                      id="ssh-host"
                      value={form.sshHost}
                      onChange={(e) => set("sshHost", e.target.value)}
                      placeholder="bastion.example.com"
                      className="font-mono"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ssh-port">Port</Label>
                    <Input
                      id="ssh-port"
                      value={form.sshPort}
                      onChange={(e) => set("sshPort", e.target.value)}
                      inputMode="numeric"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="ssh-user">SSH user</Label>
                    <Input
                      id="ssh-user"
                      value={form.sshUser}
                      onChange={(e) => set("sshUser", e.target.value)}
                      placeholder="root"
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Authentication</Label>
                    <Select
                      value={form.sshAuthMethod}
                      onValueChange={(v) =>
                        set("sshAuthMethod", v as SSHAuthMethod)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="password">Password</SelectItem>
                        <SelectItem value="key">Private key</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.sshAuthMethod === "password" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="ssh-pass">SSH password</Label>
                    <Input
                      id="ssh-pass"
                      type="password"
                      value={form.sshPassword}
                      onChange={(e) => set("sshPassword", e.target.value)}
                      placeholder={
                        editing?.ssh?.hasPassword ? "•••• unchanged" : "password"
                      }
                      autoComplete="new-password"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="ssh-key">Private key</Label>
                      <Textarea
                        id="ssh-key"
                        value={form.sshPrivateKey}
                        onChange={(e) => set("sshPrivateKey", e.target.value)}
                        placeholder={
                          editing?.ssh?.hasPrivateKey
                            ? "•••• stored, leave empty to keep"
                            : "-----BEGIN OPENSSH PRIVATE KEY-----\n…\nor a path like ~/.ssh/id_ed25519"
                        }
                        className="min-h-28 font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ssh-passphrase">Key passphrase</Label>
                      <Input
                        id="ssh-passphrase"
                        type="password"
                        value={form.sshPassphrase}
                        onChange={(e) => set("sshPassphrase", e.target.value)}
                        placeholder="optional"
                        autoComplete="new-password"
                      />
                    </div>
                  </>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="ssh-fp">Pinned host key (optional)</Label>
                  <Input
                    id="ssh-fp"
                    value={form.sshFingerprint}
                    onChange={(e) => set("sshFingerprint", e.target.value)}
                    placeholder="SHA256:…"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleTest()}
            disabled={testing || saving}
          >
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plug className="size-4" />
            )}
            Test
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || testing}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {editing ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
