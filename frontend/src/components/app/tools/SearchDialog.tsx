import { useEffect, useState } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const PAGE = 25;

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const [indexes, setIndexes] = useState<string[]>([]);
  const [index, setIndex] = useState("");
  const [query, setQuery] = useState("*");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    api
      .searchIndexes(session.id, activeDb)
      .then((res) => {
        if (cancelled) return;
        setIndexes(res.indexes ?? []);
        setIndex((prev) => prev || res.indexes?.[0] || "");
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session, activeDb]);

  const run = async (nextOffset: number) => {
    if (!session || !index) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.search(
        session.id,
        activeDb,
        index,
        query || "*",
        nextOffset,
        PAGE,
      );
      setResult(res);
      setOffset(nextOffset);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>RediSearch</DialogTitle>
          <DialogDescription>
            Query a search index with FT.SEARCH (db{activeDb}).
          </DialogDescription>
        </DialogHeader>

        {indexes.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No search indexes found. Load the RediSearch module and create an
            index first.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={index} onValueChange={setIndex}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="index" />
                </SelectTrigger>
                <SelectContent>
                  {indexes.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void run(0);
                }}
                placeholder="e.g. @name:alice"
                className="h-8 min-w-40 flex-1 font-mono text-xs"
              />
              <Button
                size="sm"
                disabled={loading || !index}
                onClick={() => void run(0)}
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <SearchIcon className="size-3.5" />
                )}
                Search
              </Button>
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            {result ? (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {result.total} result{result.total === 1 ? "" : "s"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px]"
                      disabled={offset === 0 || loading}
                      onClick={() => void run(Math.max(0, offset - PAGE))}
                    >
                      Prev
                    </Button>
                    <span>
                      {result.hits.length === 0
                        ? 0
                        : offset + 1}
                      –{offset + result.hits.length}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px]"
                      disabled={offset + result.hits.length >= result.total || loading}
                      onClick={() => void run(offset + PAGE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-[52svh]">
                  <div className="space-y-2">
                    {result.hits.map((hit, i) => {
                      const key = hit["__key"] ?? String(i);
                      return (
                        <div key={key} className="rounded-lg border p-2">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="font-mono text-[10px]"
                            >
                              {key}
                            </Badge>
                          </div>
                          <table className="w-full text-[11px]">
                            <tbody>
                              {Object.entries(hit)
                                .filter(([k]) => k !== "__key")
                                .map(([k, v]) => (
                                  <tr key={k}>
                                    <td className="w-1/3 py-0.5 pr-3 align-top font-mono text-muted-foreground">
                                      {k}
                                    </td>
                                    <td className="py-0.5 font-mono break-all">
                                      {v}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
