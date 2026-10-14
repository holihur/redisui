import { useAppStore } from "@/store/useAppStore";
import type { ToolKey } from "@/lib/types";
import { SlowlogDialog } from "./SlowlogDialog";
import { MemoryDialog } from "./MemoryDialog";
import { ClientsDialog } from "./ClientsDialog";
import { PubSubDialog } from "./PubSubDialog";
import { MonitorDialog } from "./MonitorDialog";
import { SearchDialog } from "./SearchDialog";
import { UsersDialog } from "./UsersDialog";
import { AboutDialog } from "./AboutDialog";
import { ScriptDialog } from "./ScriptDialog";
import { ProxyDialog } from "./ProxyDialog";

/** Renders whichever diagnostic tool panel is currently active. */
export function ToolDialogs() {
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);

  const open = (key: ToolKey) => activeTool === key;
  const onChange = (key: ToolKey) => (o: boolean) =>
    setActiveTool(o ? key : null);

  return (
    <>
      <SlowlogDialog open={open("slowlog")} onOpenChange={onChange("slowlog")} />
      <MemoryDialog open={open("memory")} onOpenChange={onChange("memory")} />
      <ClientsDialog open={open("clients")} onOpenChange={onChange("clients")} />
      <PubSubDialog open={open("pubsub")} onOpenChange={onChange("pubsub")} />
      <MonitorDialog open={open("monitor")} onOpenChange={onChange("monitor")} />
      <SearchDialog open={open("search")} onOpenChange={onChange("search")} />
      <ScriptDialog open={open("script")} onOpenChange={onChange("script")} />
      <ProxyDialog open={open("proxy")} onOpenChange={onChange("proxy")} />
      <UsersDialog open={open("users")} onOpenChange={onChange("users")} />
      <AboutDialog open={open("about")} onOpenChange={onChange("about")} />
    </>
  );
}
