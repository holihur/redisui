import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EditorProps } from "./types";

function prettify(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value
      : value === undefined || value === null
        ? ""
        : JSON.stringify(value);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Editor for RedisJSON documents (JSON.SET at the root path). */
export function JsonValue({ detail, busy, mutate }: EditorProps) {
  const original = useMemo(() => prettify(detail.value), [detail]);
  const [value, setValue] = useState(original);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(original);
    setDirty(false);
  }, [original]);

  const save = async () => {
    try {
      JSON.parse(value);
    } catch (e) {
      toast.error(
        `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    await mutate({ action: "json.set", value });
    setDirty(false);
  };

  const format = () => {
    setValue(prettify(value));
    setDirty(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        className="scrollbar-thin min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
        placeholder="{}"
      />
      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>{value.length} chars · JSON</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={format}>
            Format
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || busy}
            onClick={() => {
              setValue(original);
              setDirty(false);
            }}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
            <Check className="size-3.5" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
