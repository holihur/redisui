export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatTTL(ttl: number | undefined | null): string {
  if (ttl === undefined || ttl === null) return "—";
  if (ttl === -1) return "no expire";
  if (ttl === -2) return "missing";
  return formatDuration(ttl);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export const REDIS_TYPES = [
  "all",
  "string",
  "hash",
  "list",
  "set",
  "zset",
  "stream",
] as const;

export type RedisTypeFilter = (typeof REDIS_TYPES)[number];

const TYPE_COLORS: Record<string, string> = {
  string: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  hash: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
  list: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20",
  set: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  zset: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
  stream: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  none: "bg-muted text-muted-foreground border-border",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "bg-muted text-muted-foreground border-border";
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}
