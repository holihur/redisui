import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A thin vertical drag handle used to resize adjacent panels. `onResize`
 * receives the horizontal delta in pixels since the last move event.
 */
export function Resizer({
  onResize,
  className,
}: {
  onResize: (deltaX: number) => void;
  className?: string;
}) {
  const lastX = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      lastX.current = e.clientX;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      if (delta !== 0) onResize(delta);
    },
    [onResize],
  );

  const end = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className={cn(
        "group relative hidden w-1 shrink-0 cursor-col-resize touch-none bg-border/60 transition-colors hover:bg-primary/50 md:block",
        className,
      )}
    >
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}
