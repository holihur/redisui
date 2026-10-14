import { useEffect, useMemo, useState } from "react";
import { Braces, Check, Eye, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JsonHighlight } from "./JsonHighlight";
import { tryFormatJson } from "@/lib/json";
import type { EditorProps } from "./types";

export function StringValue({ detail, busy, mutate }: EditorProps) {
  const raw = typeof detail.value === "string" ? detail.value : "";
  const formatted = useMemo(() => tryFormatJson(raw), [raw]);
  const [value, setValue] = useState(raw);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<"pretty" | "raw">(
    formatted ? "pretty" : "raw",
  );

  useEffect(() => {
    const next = typeof detail.value === "string" ? detail.value : "";
    setValue(next);
    setDirty(false);
    setMode(tryFormatJson(next) ? "pretty" : "raw");
  }, [detail]);

  const valueFormatted = tryFormatJson(value);

  if (formatted && mode === "pretty") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <JsonHighlight value={formatted} />
        <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Braces className="size-3" />
            JSON · {raw.length} chars
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode("raw")}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </div>
    );
  }

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
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span>
          {value.length} chars
          {valueFormatted ? " · JSON" : ""}
        </span>
        <div className="flex gap-2">
          {formatted ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode("pretty")}
            >
              <Eye className="size-3.5" />
              Preview
            </Button>
          ) : null}
          {valueFormatted ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setValue(valueFormatted);
                setDirty(true);
              }}
            >
              <Sparkles className="size-3.5" />
              Format
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || busy}
            onClick={() => {
              setValue(raw);
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
