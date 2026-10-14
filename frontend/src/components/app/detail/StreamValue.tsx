import { Badge } from "@/components/ui/badge";
import type { StreamEntry } from "@/lib/types";
import { asArray, type EditorProps } from "./types";

export function StreamValue({ detail }: EditorProps) {
  const entries = asArray<StreamEntry>(detail.value);

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      {entries.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          Empty stream
        </p>
      ) : (
        <div className="divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="px-3 py-2">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {entry.id}
                </Badge>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {entry.fields.map((f, i) => (
                    <tr key={i}>
                      <td className="w-1/3 py-0.5 pr-3 align-top font-mono text-muted-foreground">
                        {f.field}
                      </td>
                      <td className="py-0.5 font-mono break-all">{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
