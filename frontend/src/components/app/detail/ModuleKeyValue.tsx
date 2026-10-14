import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JsonHighlight } from "./JsonHighlight";
import type { ModuleKind } from "@/lib/format";
import type { EditorProps } from "./types";

interface ModuleData {
  info?: Record<string, unknown>;
  items?: { item: string; count: number }[];
}

const ACTIONS: Record<Exclude<ModuleKind, "timeseries">, string> = {
  bloom: "bf.add",
  cuckoo: "cf.add",
  topk: "topk.add",
  cms: "cms.incrby",
  tdigest: "tdigest.add",
};

const PLACEHOLDER: Record<Exclude<ModuleKind, "timeseries">, string> = {
  bloom: "item to add",
  cuckoo: "item to add",
  topk: "item to add",
  cms: "item",
  tdigest: "value",
};

/** Read-only info + an "add" form for RedisBloom-family module keys. */
export function ModuleKeyValue({
  detail,
  busy,
  mutate,
  kind,
}: EditorProps & { kind: ModuleKind }) {
  const data = (detail.value ?? {}) as ModuleData;
  const [value, setValue] = useState("");
  const [inc, setInc] = useState("1");

  const isTimeseries = kind === "timeseries";
  const action = isTimeseries ? "ts.add" : ACTIONS[kind];

  const add = async () => {
    if (!value.trim()) {
      toast.error("Value is required");
      return;
    }
    await mutate({
      action,
      value: value.trim(),
      count: kind === "cms" ? Number(inc) || 1 : undefined,
    });
    setValue("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {data.items && data.items.length > 0 ? (
        <div className="max-h-48 shrink-0 overflow-y-auto border-b">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-1.5 font-medium">Item</th>
                <th className="px-3 py-1.5 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.item} className="border-b last:border-0">
                  <td className="max-w-0 px-3 py-1">
                    <span className="block truncate font-mono" title={it.item}>
                      {it.item}
                    </span>
                  </td>
                  <td className="px-3 py-1 text-right font-mono">{it.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder={isTimeseries ? "value" : PLACEHOLDER[kind]}
          className="h-8 min-w-40 flex-1 font-mono text-xs"
        />
        {kind === "cms" ? (
          <Input
            value={inc}
            onChange={(e) => setInc(e.target.value)}
            inputMode="numeric"
            placeholder="incr"
            className="h-8 w-20 font-mono text-xs"
          />
        ) : null}
        <Button size="sm" disabled={busy} onClick={() => void add()}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      <JsonHighlight
        value={JSON.stringify(data.info ?? {}, null, 2)}
        className="flex-1"
      />
    </div>
  );
}
