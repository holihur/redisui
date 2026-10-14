import {
  Activity,
  Code2,
  Database,
  Download,
  Info,
  KeyRound,
  Menu,
  Network,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  Radio,
  Search,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ACCENTS,
  useTheme,
  type ThemeAccent,
  type ThemeMode,
} from "@/hooks/useTheme";
import { LANGUAGES, useI18n, type Lang } from "@/lib/i18n";
import { useAppStore } from "@/store/useAppStore";

export function AppHeader() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode, accent, setAccent } = useTheme();
  const session = useAppStore((s) => s.session);
  const consoleOpen = useAppStore((s) => s.consoleOpen);
  const setConsoleOpen = useAppStore((s) => s.setConsoleOpen);
  const setServerInfoOpen = useAppStore((s) => s.setServerInfoOpen);
  const openConnectionDialog = useAppStore((s) => s.openConnectionDialog);
  const disconnect = useAppStore((s) => s.disconnect);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const role = useAppStore((s) => s.role);
  const username = useAppStore((s) => s.username);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setScriptPanelOpen = useAppStore((s) => s.setScriptPanelOpen);
  const updateStatus = useAppStore((s) => s.updateStatus);

  const collapseLabel = sidebarCollapsed
    ? t("Show connections")
    : t("Hide connections");

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-2 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        aria-label={t("Open connections")}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="size-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden shrink-0 md:inline-flex"
        aria-label={collapseLabel}
        title={collapseLabel}
        onClick={toggleSidebar}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="size-4" />
        ) : (
          <PanelLeftClose className="size-4" />
        )}
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
          {role !== "admin" ? (
            <Badge
              variant="outline"
              className={
                role === "viewer"
                  ? "shrink-0 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                  : "shrink-0 border-sky-500/40 text-[10px] text-sky-600 dark:text-sky-400"
              }
            >
              {role}
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
        <span className="truncate text-sm text-muted-foreground">
          {t("Not connected")}
        </span>
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
          <TooltipContent>{t("Command console (Ctrl/Cmd+K)")}</TooltipContent>
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
          <TooltipContent>{t("Server information")}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={!session}
              title={t("Diagnostics")}
              className="relative"
            >
              <Wrench className="size-4" />
              {updateStatus?.updateAvailable ? (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{t("Diagnostics")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setActiveTool("slowlog")}>
              <Timer className="size-4" />
              {t("Slow log")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("memory")}>
              <Activity className="size-4" />
              {t("Memory analysis")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("clients")}>
              <Users className="size-4" />
              {t("Connected clients")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("pubsub")}>
              <Radio className="size-4" />
              {t("Pub/Sub monitor")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("monitor")}>
              <Radar className="size-4" />
              {t("Profiler (MONITOR)")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("search")}>
              <Search className="size-4" />
              {t("Search (RediSearch)")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setScriptPanelOpen(true)}>
              <Code2 className="size-4" />
              {t("Lua script")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActiveTool("proxy")}>
              <Network className="size-4" />
              {t("RESP proxy")}
            </DropdownMenuItem>
            {role === "admin" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setActiveTool("users")}>
                  <Users className="size-4" />
                  {t("Users")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setActiveTool("tokens")}>
                  <KeyRound className="size-4" />
                  {t("Access tokens")}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setActiveTool("about")}>
              <Download className="size-4" />
              {t("About & updates")}
              {updateStatus?.updateAvailable ? (
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400"
                >
                  new
                </Badge>
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title={t("Appearance")}>
              <Palette className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{t("Appearance")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as ThemeMode)}
            >
              <DropdownMenuRadioItem value="light">
                {t("Light")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                {t("Dark")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("Accent")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={accent}
              onValueChange={(v) => setAccent(v as ThemeAccent)}
            >
              {ACCENTS.map((a) => (
                <DropdownMenuRadioItem key={a.value} value={a.value}>
                  {a.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("Language")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={lang}
              onValueChange={(v) => setLang(v as Lang)}
            >
              {LANGUAGES.map((l) => (
                <DropdownMenuRadioItem key={l.value} value={l.value}>
                  {l.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {username ? (
          <span className="hidden max-w-28 truncate text-xs text-muted-foreground lg:inline">
            {username}
          </span>
        ) : null}

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

        {session ? (
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            <Unplug className="size-4" />
            <span className="hidden sm:inline">{t("Disconnect")}</span>
          </Button>
        ) : null}

        {role === "admin" ? (
          <Button size="sm" onClick={() => openConnectionDialog(null)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t("Connection")}</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
