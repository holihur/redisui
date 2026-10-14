import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Mutation } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CreateType = "string" | "hash" | "list" | "set" | "zset";

export function NewKeyDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const session = useAppStore((s) => s.session);
  const activeDb = useAppStore((s) => s.activeDb);
  const afterMutation = useAppStore((s) => s.afterMutation);
  const selectKey = useAppStore((s) => s.selectKey);

  const [key, setKey] = useState("");
  const [type, setType] = useState<CreateType>("string");
  const [value, setValue] = useState("");
  const [field, setField] = useState("");
  const [score, setScore] = useState("0");
  const [side, setSide] = useState("right");
  const [ttl, setTtl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setKey("");
      setType("string");
      setValue("");
      setField("");
      setScore("0");
      setSide("right");
      setTtl("");
    }
  }, [open]);

  const submit = async () => {
    if (!session) return;
    if (!key.trim()) {
      toast.error(t("Key name is required"));
      return;
    }
    const base: Omit<Mutation, "action"> = { db: activeDb, key: key.trim(), type };
    let m: Mutation;

    switch (type) {
      case "string": {
        m = {
          ...base,
          action: "string.set",
          value,
          hasTtl: ttl !== "",
          ttl: Number(ttl) || 0,
        };
        break;
      }
      case "hash":
        if (!field.trim()) {
          toast.error(t("Field is required"));
          return;
        }
        m = { ...base, action: "hash.set", field: field.trim(), value };
        break;
      case "list":
        m = {
          ...base,
          action: "list.push",
          value,
          side,
        };
        break;
      case "set":
        m = { ...base, action: "set.add", value };
        break;
      case "zset":
        m = {
          ...base,
          action: "zset.add",
          value,
          score: Number(score) || 0,
        };
        break;
    }

    setSaving(true);
    try {
      await api.mutate(session.id, m);
      toast.success(t("Key created"));
      onOpenChange(false);
      await afterMutation();
      await selectKey(key.trim());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("New key")}</DialogTitle>
          <DialogDescription>
            {t(
              "Create a key in db{db}. Empty collections cannot be stored, so the first element is required.",
              { db: activeDb },
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="new-key">{t("Key name")}</Label>
              <Input
                id="new-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="user:1"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("Type")}</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as CreateType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">string</SelectItem>
                  <SelectItem value="hash">hash</SelectItem>
                  <SelectItem value="list">list</SelectItem>
                  <SelectItem value="set">set</SelectItem>
                  <SelectItem value="zset">zset</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {type === "hash" ? (
            <div className="grid gap-2">
              <Label htmlFor="new-field">{t("Field")}</Label>
              <Input
                id="new-field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="font-mono"
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="new-value">
              {t(type === "zset" ? "Member" : "Value")}
            </Label>
            <Textarea
              id="new-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-20 font-mono text-xs"
            />
          </div>

          {type === "zset" ? (
            <div className="grid gap-2">
              <Label htmlFor="new-score">{t("Score")}</Label>
              <Input
                id="new-score"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="font-mono"
              />
            </div>
          ) : null}

          {type === "list" ? (
            <div className="grid gap-2">
              <Label>{t("Push direction")}</Label>
              <Select value={side} onValueChange={setSide}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="right">{t("Right (RPUSH)")}</SelectItem>
                  <SelectItem value="left">{t("Left (LPUSH)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {type === "string" ? (
            <div className="grid gap-2">
              <Label htmlFor="new-ttl">{t("TTL (seconds, optional)")}</Label>
              <Input
                id="new-ttl"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                inputMode="numeric"
                placeholder={t("no expire")}
                className="font-mono"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t("Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
