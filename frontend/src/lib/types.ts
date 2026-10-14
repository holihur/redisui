export type SSHAuthMethod = "password" | "key";

export type ConnectionMode = "direct" | "sentinel" | "cluster";

export interface SSHConfigInput {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  authMethod: SSHAuthMethod;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  hostKeyFingerprint?: string;
}

export interface PublicSSH {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  authMethod: SSHAuthMethod;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
  hostKeyFingerprint?: string;
}

export interface Connection {
  id: string;
  name: string;
  mode: ConnectionMode;
  host: string;
  port: number;
  username: string;
  db: number;
  tls: boolean;
  tlsVerify: boolean;
  hasAuth: boolean;
  ssh?: PublicSSH;
  masterName?: string;
  sentinels?: string[];
  clusterAddrs?: string[];
  sentinelUsername?: string;
  hasSentinelAuth: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionInput {
  name: string;
  mode?: ConnectionMode;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
  tlsVerify: boolean;
  masterName?: string;
  sentinels?: string[];
  clusterAddrs?: string[];
  sentinelUsername?: string;
  sentinelPassword?: string;
  ssh?: SSHConfigInput;
}

export interface DatabaseInfo {
  index: number;
  keys: number;
  expires: number;
  used: boolean;
}

export interface KeyInfo {
  key: string;
  type: string;
  ttl: number;
  size: number;
}

export interface FieldValue {
  field: string;
  value: string;
}

export interface ZMember {
  member: string;
  score: number;
}

export interface StreamEntry {
  id: string;
  fields: FieldValue[];
}

export interface KeyDetail {
  key: string;
  type: string;
  ttl: number;
  size: number;
  length: number;
  cursor: number;
  offset: number;
  value: unknown;
}

export interface SessionInfo {
  id: string;
  connId: string;
  name: string;
  mode: ConnectionMode;
  host: string;
  port: number;
  db: number;
  tls: boolean;
  ssh: boolean;
  createdAt: string;
}

export interface ServerInfo {
  server: Record<string, string>;
  clients: Record<string, string>;
  memory: Record<string, string>;
  keyspace: Record<string, string>;
  stats: Record<string, string>;
  replication: Record<string, string>;
}

export interface SlowlogEntry {
  id: number;
  timestamp: number;
  durationMicros: number;
  args: string[];
  clientAddr: string;
  clientName: string;
}

export interface MemoryReport {
  info: Record<string, string>;
  doctor: string;
  topKeys: KeyInfo[];
  sampled: number;
}

export type ClientInfo = Record<string, string>;

export interface ExportItem {
  key: string;
  ttl: number;
  dump: string;
}

export interface ExportFile {
  version: number;
  db: number;
  match: string;
  exported: number;
  keys: ExportItem[];
}

export interface ImportResult {
  ok: boolean;
  imported: number;
  errors: string[];
}

export interface PubSubEvent {
  channel: string;
  pattern?: string;
  payload: string;
}

export interface ModuleInfo {
  name: string;
  ver: number;
  path: string;
}

export type SearchHit = Record<string, string>;

export interface SearchResult {
  total: number;
  hits: SearchHit[];
}

export interface SchemaField {
  name: string;
  type: string;
  options?: string[];
}

export interface IndexFieldInfo {
  name: string;
  type: string;
  attrs?: string[];
}

export interface IndexInfo {
  name: string;
  numDocs: number;
  indexOptions: string[];
  keyType?: string;
  prefixes: string[];
  fields: IndexFieldInfo[];
}

export type ToolKey =
  | "slowlog"
  | "memory"
  | "clients"
  | "pubsub"
  | "monitor"
  | "search"
  | "users"
  | "proxy"
  | "tokens"
  | "audit"
  | "about";

export interface ProxyBucket {
  t: number;
  up: number;
  down: number;
}

export interface ProxyConn {
  id: number;
  remote: string;
  startedAt: number;
  up: number;
  down: number;
  commands: number;
  lastCommand: string;
}

export interface ProxySnapshot {
  running: boolean;
  addr?: string;
  target?: string;
  active?: number;
  total?: number;
  up?: number;
  down?: number;
  commands?: number;
  conns?: ProxyConn[];
  series?: ProxyBucket[];
}

export type UserRole = "admin" | "operator" | "viewer";

export interface PublicUser {
  username: string;
  role: UserRole;
  connections: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  connections: string[];
  createdBy?: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface AuditEvent {
  time: string;
  actor: string;
  role: string;
  method: string;
  path: string;
  status: number;
  remote?: string;
  durationMs?: number;
}

export interface LoginResult {
  token: string;
  username: string;
  role: UserRole;
  connections: string[];
  expiresAt: string;
}

export interface UpdateStatus {
  enabled: boolean;
  current: string;
  latest: string;
  updateAvailable: boolean;
  publishedAt?: string;
  notes?: string;
  assetUrl?: string;
  checkedAt?: string;
  lastError?: string;
  autoApply: boolean;
  intervalSeconds: number;
}

export interface Mutation {
  db: number;
  key: string;
  type?: string;
  action: string;
  field?: string;
  value?: string;
  values?: string[];
  score?: number;
  index?: number;
  newKey?: string;
  ttl?: number;
  hasTtl?: boolean;
  keepTtl?: boolean;
  side?: string;
  count?: number;
}

export interface CommandResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface CommandInfo {
  name: string;
  arity: number;
  firstKey: number;
  lastKey: number;
  step: number;
  flags: string[];
}
