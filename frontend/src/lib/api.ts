import type {
  ClientInfo,
  CommandResult,
  Connection,
  ConnectionInput,
  DatabaseInfo,
  ExportFile,
  ExportItem,
  ImportResult,
  KeyDetail,
  KeyInfo,
  IndexInfo,
  LoginResult,
  MemoryReport,
  ModuleInfo,
  Mutation,
  PublicUser,
  SchemaField,
  SearchResult,
  ServerInfo,
  SessionInfo,
  SlowlogEntry,
  UpdateStatus,
} from "./types";

const BASE = "/api";
const TOKEN_KEY = "redisui.token";

/** Access token is kept in localStorage and sent as a Bearer header. */
export function getAuthToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAuthToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage failures (private mode)
  }
}

export function clearAuthToken(): void {
  setAuthToken("");
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event("redisui:unauthorized"));
    }
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  health: () => request<{ status: string }>("/health"),

  authStatus: () =>
    request<{ required: boolean; multiUser: boolean }>("/auth/status"),
  authVerify: () =>
    request<{
      ok: boolean;
      username: string;
      role: "admin" | "operator" | "viewer" | "full" | "readonly";
      connections: string[];
    }>("/auth/verify", { method: "POST" }),
  login: (username: string, password: string) =>
    request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () =>
    request<{
      username: string;
      role: string;
      connections: string[];
      root: boolean;
    }>("/auth/me"),

  listUsers: () => request<{ users: PublicUser[] }>("/users"),
  createUser: (input: {
    username: string;
    password: string;
    role: string;
    connections: string[];
  }) =>
    request<PublicUser>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateUser: (
    username: string,
    input: { role?: string; connections?: string[]; password?: string },
  ) =>
    request<PublicUser>(`/users/${encodeURIComponent(username)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteUser: (username: string) =>
    request<{ ok: boolean }>(`/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    }),

  updateStatus: () => request<UpdateStatus>("/update"),
  updateCheck: () =>
    request<{ ok: boolean; error?: string; status: UpdateStatus }>(
      "/update/check",
      { method: "POST" },
    ),
  updateApply: () =>
    request<{ ok: boolean; error?: string; status: UpdateStatus }>(
      "/update/apply",
      { method: "POST" },
    ),

  listConnections: () => request<Connection[]>("/connections"),
  getConnection: (id: string) => request<Connection>(`/connections/${id}`),
  createConnection: (input: ConnectionInput) =>
    request<Connection>("/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateConnection: (id: string, input: ConnectionInput) =>
    request<Connection>(`/connections/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteConnection: (id: string) =>
    request<{ deleted: string }>(`/connections/${id}`, { method: "DELETE" }),
  testConnection: (input: Partial<ConnectionInput> & { id?: string }) =>
    request<{ ok: boolean; error?: string }>("/connections/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listSessions: () => request<SessionInfo[]>("/sessions"),
  openSession: (id: string) =>
    request<{ ok: boolean; session?: SessionInfo; error?: string }>(
      `/connections/${id}/open`,
      { method: "POST" },
    ),
  closeSession: (sid: string) =>
    request<{ ok: boolean }>(`/sessions/${sid}`, { method: "DELETE" }),

  databases: (sid: string, db = 0) =>
    request<DatabaseInfo[]>(`/sessions/${sid}/databases${qs({ db })}`),
  serverInfo: (sid: string, db = 0) =>
    request<ServerInfo>(`/sessions/${sid}/info${qs({ db })}`),

  scanKeys: (
    sid: string,
    opts: {
      db: number;
      cursor?: number;
      match?: string;
      count?: number;
      type?: string;
      size?: boolean;
    },
  ) =>
    request<{ keys: KeyInfo[]; cursor: number }>(
      `/sessions/${sid}/keys${qs({
        db: opts.db,
        cursor: opts.cursor,
        match: opts.match,
        count: opts.count,
        type: opts.type === "all" ? "" : opts.type,
        size: opts.size ? "1" : undefined,
      })}`,
    ),

  getKey: (
    sid: string,
    opts: { db: number; key: string; cursor?: number; count?: number; match?: string },
  ) =>
    request<KeyDetail>(
      `/sessions/${sid}/key${qs({
        db: opts.db,
        key: opts.key,
        cursor: opts.cursor,
        count: opts.count,
        match: opts.match,
      })}`,
    ),

  mutate: (sid: string, mutation: Mutation) =>
    request<{ ok: boolean; result: unknown }>(`/sessions/${sid}/mutate`, {
      method: "POST",
      body: JSON.stringify(mutation),
    }),

  deleteKey: (sid: string, db: number, key: string) =>
    request<{ ok: boolean; deleted: number }>(
      `/sessions/${sid}/key${qs({ db, key })}`,
      { method: "DELETE" },
    ),

  command: (sid: string, db: number, command: string, args?: string[]) =>
    request<CommandResult>(`/sessions/${sid}/command`, {
      method: "POST",
      body: JSON.stringify({ db, command, args }),
    }),

  slowlog: (sid: string, db: number, count = 100) =>
    request<{ entries: SlowlogEntry[] }>(
      `/sessions/${sid}/slowlog${qs({ db, count })}`,
    ),

  memoryReport: (sid: string, db: number, sample = 1000, limit = 20) =>
    request<MemoryReport>(
      `/sessions/${sid}/memory${qs({ db, sample, limit })}`,
    ),

  clients: (sid: string, db: number) =>
    request<{ clients: ClientInfo[] }>(`/sessions/${sid}/clients${qs({ db })}`),

  bulkDelete: (sid: string, db: number, match: string) =>
    request<{ ok: boolean; deleted: number }>(
      `/sessions/${sid}/bulk-delete`,
      { method: "POST", body: JSON.stringify({ db, match }) },
    ),

  exportKeys: (sid: string, db: number, match: string, limit = 1000) =>
    request<ExportFile>(
      `/sessions/${sid}/export${qs({ db, match, limit })}`,
    ),

  importKeys: (
    sid: string,
    db: number,
    keys: ExportItem[],
    replace: boolean,
  ) =>
    request<ImportResult>(`/sessions/${sid}/import`, {
      method: "POST",
      body: JSON.stringify({ db, replace, keys }),
    }),

  /** EventSource URL for the pub/sub monitor (token must go in the query). */
  pubsubUrl: (
    sid: string,
    db: number,
    channels: string[],
    patterns: string[],
  ) =>
    `${BASE}/sessions/${sid}/pubsub${qs({
      db,
      channels: channels.join(","),
      patterns: patterns.join(","),
      token: getAuthToken(),
    })}`,

  /** EventSource URL for the MONITOR profiler (token via query string). */
  monitorUrl: (sid: string, db: number) =>
    `${BASE}/sessions/${sid}/monitor${qs({ db, token: getAuthToken() })}`,

  modules: (sid: string, db: number) =>
    request<{ modules: ModuleInfo[] }>(
      `/sessions/${sid}/modules${qs({ db })}`,
    ),

  searchIndexes: (sid: string, db: number) =>
    request<{ indexes: string[] }>(
      `/sessions/${sid}/search/indexes${qs({ db })}`,
    ),

  search: (
    sid: string,
    db: number,
    index: string,
    q: string,
    offset = 0,
    limit = 25,
  ) =>
    request<SearchResult>(
      `/sessions/${sid}/search${qs({ db, index, q, offset, limit })}`,
    ),

  searchInfo: (sid: string, db: number, index: string) =>
    request<IndexInfo>(`/sessions/${sid}/search/info${qs({ db, index })}`),

  createIndex: (
    sid: string,
    spec: {
      db: number;
      index: string;
      on: string;
      prefixes: string[];
      fields: SchemaField[];
    },
  ) =>
    request<{ ok: boolean }>(`/sessions/${sid}/search/index`, {
      method: "POST",
      body: JSON.stringify(spec),
    }),

  alterIndex: (
    sid: string,
    db: number,
    index: string,
    fields: SchemaField[],
  ) =>
    request<{ ok: boolean }>(`/sessions/${sid}/search/index/alter`, {
      method: "POST",
      body: JSON.stringify({ db, index, fields }),
    }),

  dropIndex: (sid: string, db: number, index: string, deleteDocs: boolean) =>
    request<{ ok: boolean }>(
      `/sessions/${sid}/search/index${qs({
        db,
        index,
        deleteDocs: deleteDocs ? 1 : undefined,
      })}`,
      { method: "DELETE" },
    ),
};

export { ApiError };
