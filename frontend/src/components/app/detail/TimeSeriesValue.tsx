import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EditorProps } from "./types";

interface TSData {
  info?: Record<string, unknown>;
  samples?: { ts: number; value: number }[];
}

const INFO_KEYS = [
  "totalSamples",
  "totalsamples",
  "retentionTime",
  "chunkCount",
  "memoryUsage",
  "firstTimestamp",
  "lastTimestamp",
];

const show = (v: unknown) => (v === undefined || v === null ? "—" : String(v));

/** Editor for RedisTimeSeries: recent samples + add-sample form. */
export function TimeSeriesValue({ detail, busy, mutate }: EditorProps) {
  const data = (detail.value ?? {}) as TSData;
  const samples = data.samples ?? [];
  const info = data.info ?? {};
  const [value, setValue] = useState("");
  const [ts, setTs] = useState("");

  const add = async () => {
    if (!value.trim()) {
      toast.error("Value is required");
      return;
    }
    const tsNum = ts.trim() ? Number(ts) : 0;
    await mutate({
      action: "ts.add",
      value: value.trim(),
      count: tsNum > 0 ? tsNum : undefined,
    });
    setValue("");
    setTs("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b p-3 text-[11px] sm:grid-cols-3">
        {INFO_KEYS.filter((k) => info[k] !== undefined).map((k) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="truncate text-muted-foreground">{k}</span>
            <span className="font-mono">{show(info[k])}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <Input
          value={ts}
          onChange={(e) => setTs(e.target.value)}
          placeholder="timestamp (blank = now)"
          inputMode="numeric"
          className="h-8 w-48 font-mono text-xs"
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="value"
          className="h-8 w-32 font-mono text-xs"
        />
        <Button size="sm" disabled={busy} onClick={() => void add()}>
          <Plus className="size-3.5" />
          Add sample
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {samples.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No samples
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-1.5 font-medium">Timestamp</th>
                <th className="px-3 py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.ts} className="border-b last:border-0">
                  <td className="px-3 py-1 font-mono text-muted-foreground">
                    {new Date(s.ts).toLocaleString()}
                  </td>
                  <td className="px-3 py-1 text-right font-mono">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>
    </div>
  );
}
