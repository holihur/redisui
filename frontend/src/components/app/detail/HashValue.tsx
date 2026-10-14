import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FieldValue } from "@/lib/types";
import { asArray, type EditorProps } from "./types";

export function HashValue({ detail, busy, mutate }: EditorProps) {
  const original = asArray<FieldValue>(detail.value);
  const [rows, setRows] = useState<FieldValue[]>(original);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!busy) {
      setRows(asArray<FieldValue>(detail.value));
      dirtyRef.current = false;
    }
  }, [detail, busy]);

  const update = (i: number, patch: Partial<FieldValue>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    dirtyRef.current = true;
  };

  const save = async () => {
    const origFields = new Set(original.map((r) => r.field));
    const currFields = new Set(rows.map((r) => r.field));
    for (const r of rows) {
      if (!r.field) continue;
      await mutate({ action: "hash.set", field: r.field, value: r.value });
    }
    for (const f of origFields) {
      if (!currFields.has(f)) await mutate({ action: "hash.del", field: f });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-[35%] px-3 py-1.5 font-medium">Field</th>
              <th className="px-3 py-1.5 font-medium">Value</th>
              <th className="w-10 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-1">
                  <Input
                    value={row.field}
                    onChange={(e) => update(i, { field: e.target.value })}
                    className="h-7 border-0 font-mono text-xs shadow-none focus-visible:ring-1"
                  />
                </td>
                <td className="p-1">
                  <Input
                    value={row.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    className="h-7 border-0 font-mono text-xs shadow-none focus-visible:ring-1"
                  />
                </td>
                <td className="p-1 text-center">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setRows((r) => r.filter((_, idx) => idx !== i));
                      dirtyRef.current = true;
                    }}
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
          onClick={() => {
            setRows((r) => [...r, { field: "", value: "" }]);
            dirtyRef.current = true;
          }}
        >
          <Plus className="size-3.5" />
          Add field
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          <Check className="size-3.5" />
          Save changes
        </Button>
      </div>
    </div>
  );
}
