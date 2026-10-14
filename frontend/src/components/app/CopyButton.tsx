import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** Small icon button that copies `value` to the clipboard. */
export function CopyButton({
  value,
  title,
  className,
}: {
  value: string;
  title?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1200);
      toast.success(t("Copied"));
    } catch {
      toast.error(t("Copy failed"));
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={className}
      title={title ?? t("Copy")}
      onClick={() => void copy()}
    >
      {done ? (
        <Check className="size-3 text-emerald-500" />
      ) : (
        <Copy className="size-3" />
      )}
    </Button>
  );
}
