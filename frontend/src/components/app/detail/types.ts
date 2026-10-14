import type { KeyDetail, Mutation } from "@/lib/types";

export interface EditorProps {
  detail: KeyDetail;
  busy: boolean;
  mutate: (m: Partial<Mutation>) => Promise<void>;
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
