import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Download,
  KeyRound,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { REDIS_TYPES, typeLabel } from "@/lib/format";
import type { RedisTypeFilter } from "@/lib/format";
import { buildKeyTree, collectExpandablePaths } from "@/lib/keytree";
import { useAppStore } from "@/store/useAppStore";
import { NewKeyDialog } from "./NewKeyDialog";
import { KeyTree } from "./KeyTree";

const ExportDialog = lazy(() =>
  import("./tools/KeyDialogs").then((m) => ({ default: m.ExportDialog })),
);
const ImportDialog = lazy(() =>
  import("./tools/KeyDialogs").then((m) => ({ default: m.ImportDialog })),
);
const BulkDeleteDialog = lazy(() =>
  import("./tools/KeyDialogs").then((m) => ({ default: m.BulkDeleteDialog })),
);

export function KeyBrowser({ className }: { className?: string }) {
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const keys = useAppStore((s) => s.keys);
  const keysLoading = useAppStore((s) => s.keysLoading);
  const keysDone = useAppStore((s) => s.keysDone);
  const keyType = useAppStore((s) => s.keyType);
  const selectedKey = useAppStore((s) => s.selectedKey);
  const setKeyType = useAppStore((s) => s.setKeyType);
  const setKeyMatch = useAppStore((s) => s.setKeyMatch);
  const loadKeys = useAppStore((s) => s.loadKeys);
  const loadMoreKeys = useAppStore((s) => s.loadMoreKeys);
  const selectKey = useAppStore((s) => s.selectKey);
  const afterMutation = useAppStore((s) => s.afterMutation);

  const [search, setSearch] = useState("*");
  const debounced = useDebounce(search, 350);
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);
  const tree = useMemo(() => buildKeyTree(keys), [keys]);
  const expandablePaths = useMemo(() => collectExpandablePaths(tree), [tree]);
  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    const rec: Record<string, boolean> = {};
    for (const p of expandablePaths) rec[p] = next;
    setExpanded(rec);
  };

  useEffect(() => {
    if (debounced !== useAppStore.getState().keyMatch) {
      setKeyMatch(debounced || "*");
      void loadKeys(true);
    }
  }, [debounced, setKeyMatch, loadKeys]);

  const handleDelete = async () => {
    if (!session || !selectedKey) return;
    try {
      await api.deleteKey(session.id, activeDb, selectedKey);
      toast.success(`Deleted “${selectedKey}”`);
      await selectKey(null);
      await afterMutation();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteOpen(false);
    }
  };

  return (
    <section className={cn("flex min-w-0 flex-1 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pattern, e.g. user:*"
            className="h-8 pl-8 font-mono text-xs"
          />
        </div>

        <Select
          value={keyType}
          onValueChange={(v) => {
            setKeyType(v as RedisTypeFilter);
            void loadKeys(true);
          }}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REDIS_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {typeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void loadKeys(true)}
          disabled={keysLoading}
          title="Refresh"
        >
          {keysLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDeleteOpen(true)}
          disabled={!selectedKey}
          title="Delete selected key"
        >
          <Trash2 className="size-4" />
        </Button>

        <Button size="sm" onClick={() => setNewKeyOpen(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">New</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" title="More actions">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setExportOpen(true)}>
              <Download className="size-4" />
              Export keys…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import keys…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setBulkOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete by pattern…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {keys.length === 0 && !keysLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <KeyRound className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No keys found in db{activeDb}
          </p>
        </div>
      ) : (
        <KeyTree
          root={tree}
          expanded={expanded}
          onToggle={(path, open) =>
            setExpanded((e) => ({ ...e, [path]: open }))
          }
          selectedKey={selectedKey}
          onSelect={(k) => void selectKey(k)}
        />
      )}

      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t px-3 text-[11px] text-muted-foreground">
        <span className="truncate">
          {keys.length} key{keys.length === 1 ? "" : "s"} loaded
          {keysDone ? "" : " · more available"}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {expandablePaths.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={toggleAll}
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          ) : null}
          {!keysDone ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => void loadMoreKeys()}
              disabled={keysLoading}
            >
              {keysLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : null}
              Load more
            </Button>
          ) : null}
        </div>
      </div>

      <NewKeyDialog open={newKeyOpen} onOpenChange={setNewKeyOpen} />
      <Suspense fallback={null}>
        {exportOpen ? (
          <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
        ) : null}
        {importOpen ? (
          <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
        ) : null}
        {bulkOpen ? (
          <BulkDeleteDialog open={bulkOpen} onOpenChange={setBulkOpen} />
        ) : null}
      </Suspense>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete key?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono">
              {selectedKey}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
