import {
  Activity,
  Database,
  Info,
  Menu,
  Moon,
  Plus,
  Radar,
  Radio,
  Search,
  Sun,
  Terminal,
  Timer,
  Unplug,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import { useAppStore } from "@/store/useAppStore";

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const session = useAppStore((s) => s.session);
  const consoleOpen = useAppStore((s) => s.consoleOpen);
  const setConsoleOpen = useAppStore((s) => s.setConsoleOpen);
  const setServerInfoOpen = useAppStore((s) => s.setServerInfoOpen);
  const openConnectionDialog = useAppStore((s) => s.openConnectionDialog);
  const disconnect = useAppStore((s) => s.disconnect);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const role = useAppStore((s) => s.role);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-2 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        aria-label="Open connections"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="size-4" />
      </Button>

      <div className="hidden items-center gap-2 sm:flex">
        <div className="flex size-7 items-center justify-center rounded-md bg-red-500/15 text-red-500">
          <Database className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">RedisUI</span>
      </div>

      <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

      {session ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-muted-foreground">
            {session.name}
          </span>
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            db{session.db}
          </Badge>
          {session.mode && session.mode !== "direct" ? (
            <Badge variant="outline" className="hidden text-[10px] capitalize sm:inline-flex">
              {session.mode}
            </Badge>
          ) : null}
          {role === "readonly" ? (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
            >
              read-only
            </Badge>
          ) : null}
          {session.tls ? (
            <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
              TLS
            </Badge>
          ) : null}
          {session.ssh ? (
            <Badge
              variant="outline"
              className="hidden border-emerald-500/30 text-[10px] text-emerald-600 sm:inline-flex dark:text-emerald-400"
            >
              SSH
            </Badge>
          ) : null}
        </div>
      ) : (
        <span className="truncate text-sm text-muted-foreground">Not connected</span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={consoleOpen ? "secondary" : "ghost"}
              size="icon"
              disabled={!session}
              onClick={() => setConsoleOpen(!consoleOpen)}
            >
              <Terminal className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Command console (Ctrl/Cmd+K)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!session}
              onClick={() => setServerInfoOpen(true)}
            >
              <Info className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Server information</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!session}
              title="Diagnostics"
            >
              <Wrench className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Diagnostics</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setActiveTool("slowlog")}>
              <Timer className="size-4" />
              Slow log
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("memory")}>
              <Activity className="size-4" />
              Memory analysis
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("clients")}>
              <Users className="size-4" />
              Connected clients
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("pubsub")}>
              <Radio className="size-4" />
              Pub/Sub monitor
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("monitor")}>
              <Radar className="size-4" />
              Profiler (MONITOR)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("search")}>
              <Search className="size-4" />
              Search (RediSearch)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={toggle}>
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle theme</TooltipContent>
        </Tooltip>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        {session ? (
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            <Unplug className="size-4" />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
        ) : null}

        <Button size="sm" onClick={() => openConnectionDialog(null)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Connection</span>
        </Button>
      </div>
    </header>
  );
}
