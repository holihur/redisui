import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ZMember } from "@/lib/types";
import { asArray, type EditorProps } from "./types";

export function ZSetValue({ detail, busy, mutate }: EditorProps) {
  const original = asArray<ZMember>(detail.value);
  const [rows, setRows] = useState<ZMember[]>(original);

  useEffect(() => {
    if (!busy) setRows(asArray<ZMember>(detail.value));
  }, [detail, busy]);

  const update = (i: number, patch: Partial<ZMember>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    const orig = new Set(original.map((r) => r.member));
    const curr = new Set(rows.filter((r) => r.member !== "").map((r) => r.member));
    for (const r of rows) {
      if (!r.member) continue;
      await mutate({ action: "zset.add", value: r.member, score: Number(r.score) || 0 });
    }
    for (const m of orig) if (!curr.has(m)) await mutate({ action: "zset.rem", value: m });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Member</th>
              <th className="w-28 px-3 py-1.5 font-medium">Score</th>
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-1">
                  <Input
                    value={row.member}
                    onChange={(e) => update(i, { member: e.target.value })}
                    className="h-7 border-0 font-mono text-xs shadow-none focus-visible:ring-1"
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={String(row.score)}
                    onChange={(e) => update(i, { score: Number(e.target.value) })}
                    className="h-7 border-0 font-mono text-xs shadow-none focus-visible:ring-1"
                  />
                </td>
                <td className="p-1 text-center">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((r) => [...r, { member: "", score: 0 }])}
        >
          <Plus className="size-3.5" />
          Add member
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          <Check className="size-3.5" />
          Save changes
        </Button>
      </div>
    </div>
  );
}
