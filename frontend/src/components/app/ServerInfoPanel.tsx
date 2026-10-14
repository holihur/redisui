import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ModuleInfo, ServerInfo } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

function KeyValues({ data }: { data: Record<string, string> }) {
  const { t } = useI18n();
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        {t("No data")}
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b last:border-0">
            <td className="w-1/2 py-1.5 pr-4 align-top font-mono text-muted-foreground">
              {k}
            </td>
            <td className="py-1.5 font-mono break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ServerInfoPanel() {
  const open = useAppStore((s) => s.serverInfoOpen);
  const setOpen = useAppStore((s) => s.setServerInfoOpen);
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const { t } = useI18n();

  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    setLoading(true);
    api
      .serverInfo(session.id, activeDb)
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    api
      .modules(session.id, activeDb)
      .then((res) => {
        if (!cancelled) setModules(res.modules ?? []);
      })
      .catch(() => {
        if (!cancelled) setModules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session, activeDb]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("Server information")}</DialogTitle>
          <DialogDescription>
            {t("Live output of the Redis INFO command.")}
          </DialogDescription>
        </DialogHeader>

        {loading && !info ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="server">
            <TabsList className="scrollbar-thin w-full justify-start overflow-x-auto">
              <TabsTrigger value="server">{t("Server")}</TabsTrigger>
              <TabsTrigger value="clients">{t("Clients")}</TabsTrigger>
              <TabsTrigger value="memory">{t("Memory")}</TabsTrigger>
              <TabsTrigger value="keyspace">{t("Keyspace")}</TabsTrigger>
              <TabsTrigger value="stats">{t("Stats")}</TabsTrigger>
              <TabsTrigger value="replication">{t("Replication")}</TabsTrigger>
              <TabsTrigger value="modules">{t("Modules")}</TabsTrigger>
            </TabsList>
            <ScrollArea className="h-[55svh] pr-3">
              <TabsContent value="server" className="mt-3">
                <KeyValues data={info?.server ?? {}} />
              </TabsContent>
              <TabsContent value="clients" className="mt-3">
                <KeyValues data={info?.clients ?? {}} />
              </TabsContent>
              <TabsContent value="memory" className="mt-3">
                <KeyValues data={info?.memory ?? {}} />
              </TabsContent>
              <TabsContent value="keyspace" className="mt-3">
                <KeyValues data={info?.keyspace ?? {}} />
              </TabsContent>
              <TabsContent value="stats" className="mt-3">
                <KeyValues data={info?.stats ?? {}} />
              </TabsContent>
              <TabsContent value="replication" className="mt-3">
                <KeyValues data={info?.replication ?? {}} />
              </TabsContent>
              <TabsContent value="modules" className="mt-3">
                {modules.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    {t("No modules loaded")}
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {modules.map((m) => (
                        <tr key={m.name} className="border-b last:border-0">
                          <td className="py-1.5 pr-4 align-top font-mono">
                            {m.name}
                          </td>
                          <td className="py-1.5 pr-4 align-top font-mono text-muted-foreground">
                            ver {m.ver}
                          </td>
                          <td className="py-1.5 align-top font-mono break-all text-muted-foreground">
                            {m.path}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
