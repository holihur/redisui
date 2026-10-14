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
import type { ServerInfo } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

function KeyValues({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        No data
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

  const [info, setInfo] = useState<ServerInfo | null>(null);
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
    return () => {
      cancelled = true;
    };
  }, [open, session, activeDb]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Server information</DialogTitle>
          <DialogDescription>
            Live output of the Redis <span className="font-mono">INFO</span>{" "}
            command.
          </DialogDescription>
        </DialogHeader>

        {loading && !info ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="server">
            <TabsList className="scrollbar-thin w-full justify-start overflow-x-auto">
              <TabsTrigger value="server">Server</TabsTrigger>
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="memory">Memory</TabsTrigger>
              <TabsTrigger value="keyspace">Keyspace</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="replication">Replication</TabsTrigger>
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
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
