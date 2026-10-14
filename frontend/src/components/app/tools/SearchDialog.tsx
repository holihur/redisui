import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Loader2,
  Plus,
  Search as SearchIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { IndexInfo, SchemaField, SearchResult } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

const PAGE = 25;
const FIELD_TYPES = ["TEXT", "TAG", "NUMERIC", "GEO"] as const;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const parseOptions = (s: string) =>
  s.split(/\s+/).map((t) => t.trim()).filter(Boolean);

/* -------------------------------------------------------------------------- */
/* Query tab                                                                  */
/* -------------------------------------------------------------------------- */

function QueryTab({
  sessionId,
  db,
  indexes,
}: {
  sessionId: string;
  db: number;
  indexes: string[];
}) {
  const [index, setIndex] = useState("");
  const [query, setQuery] = useState("*");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setIndex((prev) => prev || indexes[0] || "");
  }, [indexes]);

  const run = async (nextOffset: number) => {
    if (!index) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.search(sessionId, db, index, query || "*", nextOffset, PAGE);
      setResult(res);
      setOffset(nextOffset);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  };

  if (indexes.length === 0 && !index) {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          No search indexes detected. Enter an index name to query, or create
          one on the “Create” tab.
        </p>
        <Input
          value={index}
          onChange={(e) => setIndex(e.target.value)}
          placeholder="index name"
          className="mx-auto h-8 w-48 font-mono text-xs"
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {indexes.length > 0 ? (
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
        ) : (
          <Input
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            placeholder="index name"
            className="h-8 w-40 font-mono text-xs"
          />
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run(0);
          }}
          placeholder="e.g. @name:alice"
          className="h-8 min-w-40 flex-1 font-mono text-xs"
        />
        <Button size="sm" disabled={loading || !index} onClick={() => void run(0)}>
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
                {result.hits.length === 0 ? 0 : offset + 1}–
                {offset + result.hits.length}
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

          <ScrollArea className="h-[48svh]">
            <div className="space-y-2">
              {result.hits.map((hit, i) => {
                const key = hit["__key"] ?? String(i);
                return (
                  <div key={key} className="rounded-lg border p-2">
                    <Badge variant="secondary" className="mb-1 font-mono text-[10px]">
                      {key}
                    </Badge>
                    <table className="w-full text-[11px]">
                      <tbody>
                        {Object.entries(hit)
                          .filter(([k]) => k !== "__key")
                          .map(([k, v]) => (
                            <tr key={k}>
                              <td className="w-1/3 py-0.5 pr-3 align-top font-mono text-muted-foreground">
                                {k}
                              </td>
                              <td className="py-0.5 font-mono break-all">{v}</td>
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
  );
}

/* -------------------------------------------------------------------------- */
/* Indexes tab                                                                */
/* -------------------------------------------------------------------------- */

function IndexSummary({ info }: { info: IndexInfo }) {
  return (
    <div className="rounded-lg border p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Database className="size-3.5" />
          {info.keyType || "HASH"}
        </span>
        <span>{info.numDocs} docs</span>
        {info.prefixes.length > 0 ? (
          <span className="font-mono">prefix: {info.prefixes.join(", ")}</span>
        ) : null}
      </div>
      <table className="w-full">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Type</th>
            <th className="py-1 font-medium">Options</th>
          </tr>
        </thead>
        <tbody>
          {info.fields.map((f) => (
            <tr key={f.name} className="border-b last:border-0">
              <td className="py-1 pr-3 font-mono">{f.name}</td>
              <td className="py-1 pr-3 font-mono">{f.type}</td>
              <td className="py-1 font-mono text-muted-foreground">
                {f.attrs?.join(" ") ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndexesTab({
  sessionId,
  db,
  indexes,
  onChanged,
  onQuery,
}: {
  sessionId: string;
  db: number;
  indexes: string[];
  onChanged: () => void;
  onQuery: (index: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [info, setInfo] = useState<IndexInfo | null>(null);
  const [deleteDocs, setDeleteDocs] = useState(false);
  const [newField, setNewField] = useState<SchemaField>({
    name: "",
    type: "TEXT",
    options: [],
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected((prev) => prev || indexes[0] || "");
  }, [indexes]);

  useEffect(() => {
    if (!selected) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    api
      .searchInfo(sessionId, db, selected)
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, db, selected]);

  const drop = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.dropIndex(sessionId, db, selected, deleteDocs);
      toast.success(`Dropped index ${selected}`);
      setSelected("");
      onChanged();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const alter = async () => {
    if (!selected || !newField.name.trim()) return;
    setBusy(true);
    try {
      await api.alterIndex(sessionId, db, selected, [
        { ...newField, name: newField.name.trim() },
      ]);
      toast.success(`Added field ${newField.name}`);
      setNewField({ name: "", type: "TEXT", options: [] });
      const res = await api.searchInfo(sessionId, db, selected);
      setInfo(res);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (indexes.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          No indexes detected (this Redis may not support FT._LIST). Enter an
          index name to inspect it.
        </p>
        <Input
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          placeholder="index name"
          className="h-8 w-48 font-mono text-xs"
        />
        {info ? <IndexSummary info={info} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger size="sm" className="w-48">
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
        <Button
          variant="outline"
          size="sm"
          disabled={!selected}
          onClick={() => onQuery(selected)}
        >
          <SearchIcon className="size-3.5" />
          Query
        </Button>
      </div>

      {info ? <IndexSummary info={info} /> : null}

      <div className="rounded-lg border p-3">
        <p className="mb-2 text-xs font-medium">Add field (FT.ALTER)</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newField.name}
            onChange={(e) => setNewField((f) => ({ ...f, name: e.target.value }))}
            placeholder="field name"
            className="h-8 w-40 font-mono text-xs"
          />
          <Select
            value={newField.type}
            onValueChange={(v) => setNewField((f) => ({ ...f, type: v }))}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={newField.options?.join(" ") ?? ""}
            onChange={(e) =>
              setNewField((f) => ({ ...f, options: parseOptions(e.target.value) }))
            }
            placeholder="SORTABLE"
            className="h-8 min-w-32 flex-1 font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={busy || !newField.name.trim()}
            onClick={() => void alter()}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-destructive/40 p-3">
        <p className="mb-2 text-xs font-medium text-destructive">Drop index</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox
              checked={deleteDocs}
              onCheckedChange={(v) => setDeleteDocs(v === true)}
            />
            Also delete indexed documents (DD)
          </label>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || !selected}
            onClick={() => void drop()}
          >
            <Trash2 className="size-3.5" />
            Drop {selected}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create tab                                                                 */
/* -------------------------------------------------------------------------- */

function CreateTab({
  sessionId,
  db,
  onCreated,
}: {
  sessionId: string;
  db: number;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [on, setOn] = useState("HASH");
  const [prefixes, setPrefixes] = useState("");
  const [fields, setFields] = useState<SchemaField[]>([
    { name: "", type: "TEXT", options: [] },
  ]);
  const [busy, setBusy] = useState(false);

  const patch = (i: number, p: Partial<SchemaField>) =>
    setFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...p } : row)));

  const create = async () => {
    if (!name.trim()) {
      toast.error("Index name is required");
      return;
    }
    const clean = fields.filter((f) => f.name.trim());
    if (clean.length === 0) {
      toast.error("Add at least one field");
      return;
    }
    setBusy(true);
    try {
      await api.createIndex(sessionId, {
        db,
        index: name.trim(),
        on,
        prefixes: prefixes.split(",").map((s) => s.trim()).filter(Boolean),
        fields: clean.map((f) => ({ ...f, name: f.name.trim() })),
      });
      toast.success(`Created index ${name.trim()}`);
      setName("");
      setPrefixes("");
      setFields([{ name: "", type: "TEXT", options: [] }]);
      onCreated();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="grid gap-2">
          <Label htmlFor="idx-name">Index name</Label>
          <Input
            id="idx-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="products"
            className="font-mono"
          />
        </div>
        <div className="grid gap-2">
          <Label>On</Label>
          <Select value={on} onValueChange={setOn}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HASH">HASH</SelectItem>
              <SelectItem value="JSON">JSON</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="idx-prefix">Key prefixes (comma-separated, optional)</Label>
        <Input
          id="idx-prefix"
          value={prefixes}
          onChange={(e) => setPrefixes(e.target.value)}
          placeholder="product:, item:"
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label>Fields</Label>
        {fields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              value={f.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              placeholder="field name"
              className="h-8 w-36 font-mono text-xs"
            />
            <Select
              value={f.type}
              onValueChange={(v) => patch(i, { type: v })}
            >
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={f.options?.join(" ") ?? ""}
              onChange={(e) => patch(i, { options: parseOptions(e.target.value) })}
              placeholder="SORTABLE"
              className="h-8 min-w-28 flex-1 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFields((rows) => rows.filter((_, idx) => idx !== i))}
              disabled={fields.length === 1}
              title="Remove field"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setFields((rows) => [...rows, { name: "", type: "TEXT", options: [] }])
          }
        >
          <Plus className="size-3.5" />
          Add field
        </Button>
      </div>

      <div className="flex justify-end">
        <Button disabled={busy} onClick={() => void create()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Create index
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

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
  const [tab, setTab] = useState("query");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!session) return;
    try {
      const res = await api.searchIndexes(session.id, activeDb);
      setIndexes(res.indexes ?? []);
      setError("");
    } catch (e) {
      setIndexes([]);
      setError(errText(e));
    }
  }, [session, activeDb]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>RediSearch</DialogTitle>
          <DialogDescription>
            Query and manage search indexes (db{activeDb}).
          </DialogDescription>
        </DialogHeader>

        {session ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="scrollbar-thin w-full justify-start overflow-x-auto">
              <TabsTrigger value="query">Query</TabsTrigger>
              <TabsTrigger value="indexes">Indexes</TabsTrigger>
              <TabsTrigger value="create">Create</TabsTrigger>
            </TabsList>
            {error ? (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            ) : null}
            <TabsContent value="query" className="mt-3">
              <QueryTab sessionId={session.id} db={activeDb} indexes={indexes} />
            </TabsContent>
            <TabsContent value="indexes" className="mt-3">
              <IndexesTab
                sessionId={session.id}
                db={activeDb}
                indexes={indexes}
                onChanged={reload}
                onQuery={(i) => {
                  setTab("query");
                  void i;
                }}
              />
            </TabsContent>
            <TabsContent value="create" className="mt-3">
              <CreateTab
                sessionId={session.id}
                db={activeDb}
                onCreated={() => {
                  void reload();
                  setTab("indexes");
                }}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
