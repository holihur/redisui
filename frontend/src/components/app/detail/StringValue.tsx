import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EditorProps } from "./types";

export function StringValue({ detail, busy, mutate }: EditorProps) {
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(typeof detail.value === "string" ? detail.value : "");
    setDirty(false);
  }, [detail]);

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
        placeholder="(empty)"
      />
      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>{value.length} chars</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || busy}
            onClick={() => {
              setValue(typeof detail.value === "string" ? detail.value : "");
              setDirty(false);
            }}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button
            size="sm"
            disabled={!dirty || busy}
            onClick={() =>
              void mutate({ action: "string.set", value, keepTtl: true }).then(
                () => setDirty(false),
              )
            }
          >
            <Check className="size-3.5" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
