import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { asArray, type EditorProps } from "./types";

export function ListValue({ detail, busy, mutate }: EditorProps) {
  const rows = asArray<string>(detail.value);
  const offset = detail.offset ?? 0;
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [newValue, setNewValue] = useState("");
  const [side, setSide] = useState("right");

  useEffect(() => {
    setEdits({});
  }, [detail]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-14 px-3 py-1.5 font-medium">Index</th>
              <th className="px-3 py-1.5 font-medium">Value</th>
              <th className="w-24 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((value, i) => {
              const current = edits[i] ?? value;
              const dirty = edits[i] !== undefined && edits[i] !== value;
              return (
                <tr key={offset + i} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">
                    {offset + i}
                  </td>
                  <td className="p-1">
                    <Input
                      value={current}
                      onChange={(e) =>
                        setEdits((s) => ({ ...s, [i]: e.target.value }))
                      }
                      className="h-7 border-0 font-mono text-xs shadow-none focus-visible:ring-1"
                    />
                  </td>
                  <td className="flex items-center gap-0.5 p-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={!dirty || busy}
                      title="Save element"
                      onClick={() =>
                        void mutate({
                          action: "list.set",
                          index: offset + i,
                          value: current,
                        }).then(() =>
                          setEdits((s) => {
                            const next = { ...s };
                            delete next[i];
                            return next;
                          }),
                        )
                      }
                    >
                      <Check className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Remove element"
                      onClick={() =>
                        void mutate({
                          action: "list.rem",
                          value,
                          count: 1,
                        })
                      }
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Empty list
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="New element"
          className="h-8 flex-1 font-mono text-xs"
        />
        <Select value={side} onValueChange={setSide}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="right">RPUSH</SelectItem>
            <SelectItem value="left">LPUSH</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void mutate({ action: "list.push", value: newValue, side }).then(
              () => setNewValue(""),
            )
          }
        >
          {side === "left" ? (
            <ArrowUpToLine className="size-3.5" />
          ) : (
            <ArrowDownToLine className="size-3.5" />
          )}
          Push
        </Button>
      </div>
    </div>
  );
}
