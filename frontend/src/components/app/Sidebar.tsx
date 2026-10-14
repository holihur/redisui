import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  KeyRound,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import type { Connection } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

export function Sidebar() {
  const connections = useAppStore((s) => s.connections);
  const connectionsLoading = useAppStore((s) => s.connectionsLoading);
  const session = useAppStore((s) => s.session);
  const activeConnId = useAppStore((s) => s.activeConnId);
  const databases = useAppStore((s) => s.databases);
  const activeDb = useAppStore((s) => s.activeDb);
  const setActiveDb = useAppStore((s) => s.setActiveDb);
  const openConnection = useAppStore((s) => s.openConnection);
  const disconnect = useAppStore((s) => s.disconnect);
  const refreshDatabases = useAppStore((s) => s.refreshDatabases);
  const openConnectionDialog = useAppStore((s) => s.openConnectionDialog);
  const loadConnections = useAppStore((s) => s.loadConnections);
  const keysScanned = useAppStore((s) => s.keysScanned);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);

  const toggleCollapse = (id: string) =>
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const handleTest = async (conn: Connection) => {
    const t = toast.loading(`Testing ${conn.name}…`);
    try {
      const res = await api.testConnection({ id: conn.id });
      if (res.ok) toast.success(`Connected to ${conn.name}`, { id: t });
      else toast.error(res.error ?? "Connection failed", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id: t });
    }
  };

  const handleDuplicate = async (conn: Connection) => {
    try {
      await api.createConnection({
        name: `${conn.name} copy`,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        db: conn.db,
        tls: conn.tls,
        tlsVerify: conn.tlsVerify,
        ssh: conn.ssh
          ? {
              enabled: conn.ssh.enabled,
              host: conn.ssh.host,
              port: conn.ssh.port,
              user: conn.ssh.user,
              authMethod: conn.ssh.authMethod,
              hostKeyFingerprint: conn.ssh.hostKeyFingerprint,
            }
          : undefined,
      });
      toast.success("Connection duplicated");
      await loadConnections();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteConnection(deleteTarget.id);
      if (activeConnId === deleteTarget.id) await disconnect();
      toast.success("Connection deleted");
      await loadConnections();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <div
        aria-hidden
        onClick={() => setSidebarOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "flex w-72 shrink-0 flex-col border-r bg-sidebar",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-xl max-md:transition-transform max-md:duration-200",
          sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          "md:relative md:translate-x-0",
        )}
      >
      <div className="flex h-10 items-center justify-between border-b px-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Connections
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!session}
            onClick={() => void refreshDatabases()}
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => openConnectionDialog(null)}
            title="New connection"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setSidebarOpen(false)}
            title="Close"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {connectionsLoading && connections.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          ) : connections.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                No connections yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => openConnectionDialog(null)}
              >
                <Plus className="size-3.5" />
                Add connection
              </Button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {connections.map((conn) => {
                const isActive = activeConnId === conn.id && !!session;
                const isOpen = isActive && !collapsed[conn.id];
                return (
                  <div key={conn.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            if (isActive) toggleCollapse(conn.id);
                            else void openConnection(conn.id);
                          }}
                          className={cn(
                            "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/60",
                          )}
                        >
                          {isActive ? (
                            isOpen ? (
                              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            )
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              isActive
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-medium">
                                {conn.name}
                              </span>
                              {conn.ssh?.enabled ? (
                                <KeyRound className="size-3 shrink-0 text-emerald-500" />
                              ) : null}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">
                              {conn.host}:{conn.port}
                              {conn.tls ? " · tls" : ""}
                            </span>
                          </span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-48">
                        {isActive ? (
                          <ContextMenuItem onSelect={() => void disconnect()}>
                            <Unplug className="size-4" />
                            Disconnect
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem
                            onSelect={() => void openConnection(conn.id)}
                          >
                            <Plug className="size-4" />
                            Connect
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem
                          onSelect={() => void handleTest(conn)}
                        >
                          <Server className="size-4" />
                          Test connection
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={() => openConnectionDialog(conn)}
                        >
                          <Pencil className="size-4" />
                          Edit…
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => void handleDuplicate(conn)}
                        >
                          <Copy className="size-4" />
                          Duplicate
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={() => setDeleteTarget(conn)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>

                    {isOpen ? (
                      <div className="mt-0.5 mb-1 ml-5 space-y-0.5 border-l pl-2">
                        {databases.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-muted-foreground">
                            Loading databases…
                          </p>
                        ) : (
                          databases.map((db) => (
                            <button
                              key={db.index}
                              type="button"
                              onClick={() => void setActiveDb(db.index)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
                                activeDb === db.index
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-accent/60",
                              )}
                            >
                              <Database className="size-3.5 shrink-0" />
                              <span className="flex-1 font-mono">
                                db{db.index}
                              </span>
                              {db.used ? (
                                <Badge
                                  variant="secondary"
                                  className="h-4 px-1.5 font-mono text-[10px]"
                                >
                                  {db.keys}
                                </Badge>
                              ) : null}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {session ? (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Keys loaded</span>
            <span className="font-mono">{keysScanned}</span>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete connection?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be permanently removed. This does not
              affect the Redis server.
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
      </aside>
    </>
  );
}
