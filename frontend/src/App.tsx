import { lazy, Suspense, useEffect } from "react";
import { Database, KeyRound, Plug, Terminal } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app/AppHeader";
import { Sidebar } from "@/components/app/Sidebar";
import { KeyBrowser } from "@/components/app/KeyBrowser";
import { KeyDetail } from "@/components/app/KeyDetail";
import { CommandConsole } from "@/components/app/CommandConsole";
import { Resizer } from "@/components/app/Resizer";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

const ServerInfoPanel = lazy(() =>
  import("@/components/app/ServerInfoPanel").then((m) => ({
    default: m.ServerInfoPanel,
  })),
);
const ToolDialogs = lazy(() =>
  import("@/components/app/tools/ToolDialogs").then((m) => ({
    default: m.ToolDialogs,
  })),
);
const ConnectionDialog = lazy(() =>
  import("@/components/app/ConnectionDialog").then((m) => ({
    default: m.ConnectionDialog,
  })),
);

function EmptyState() {
  const openConnectionDialog = useAppStore((s) => s.openConnectionDialog);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border bg-muted/40">
        <Database className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">No active connection</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Select a connection from the sidebar, or create a new one. SSH tunnels
          are supported for reaching private Redis instances.
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Plug className="size-3.5" /> Direct / TLS
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5" /> SSH tunnel
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Terminal className="size-3.5" /> Command console
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => openConnectionDialog(null)}>New connection</Button>
        <Button
          variant="outline"
          className="md:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <Database className="size-3.5" />
          Connections
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const loadConnections = useAppStore((s) => s.loadConnections);
  const session = useAppStore((s) => s.session);
  const selectedKey = useAppStore((s) => s.selectedKey);
  const serverInfoOpen = useAppStore((s) => s.serverInfoOpen);
  const activeTool = useAppStore((s) => s.activeTool);
  const connectionDialogOpen = useAppStore((s) => s.connectionDialogOpen);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const adjustSidebarWidth = useAppStore((s) => s.adjustSidebarWidth);
  const adjustDetailWidth = useAppStore((s) => s.adjustDetailWidth);
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .updateStatus()
        .then((s) => {
          if (!cancelled) setUpdateStatus(s);
        })
        .catch(() => {});
    };
    void load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setUpdateStatus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useAppStore.getState().setConsoleOpen(!useAppStore.getState().consoleOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
        <AppHeader />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          {isDesktop && !sidebarCollapsed ? (
            <Resizer onResize={adjustSidebarWidth} />
          ) : null}
          <main className="flex min-w-0 flex-1 flex-col">
            {session ? (
              <>
                <div className="flex min-h-0 flex-1">
                  <KeyBrowser className={cn(selectedKey && "max-md:hidden")} />
                  {isDesktop && selectedKey ? (
                    <Resizer onResize={(d) => adjustDetailWidth(-d)} />
                  ) : null}
                  <KeyDetail />
                </div>
                <CommandConsole />
              </>
            ) : (
              <EmptyState />
            )}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        {serverInfoOpen ? <ServerInfoPanel /> : null}
        {activeTool ? <ToolDialogs /> : null}
        {connectionDialogOpen ? <ConnectionDialog /> : null}
      </Suspense>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
