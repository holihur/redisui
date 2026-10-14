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
  | "search";

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
