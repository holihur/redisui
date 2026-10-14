import { create } from "zustand";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  Connection,
  DatabaseInfo,
  KeyDetail,
  KeyInfo,
  SessionInfo,
} from "@/lib/types";
import type { RedisTypeFilter } from "@/lib/format";
import type { ToolKey } from "@/lib/types";

interface AppState {
  connections: Connection[];
  connectionsLoading: boolean;

  activeConnId: string | null;
  session: SessionInfo | null;
  connecting: boolean;

  databases: DatabaseInfo[];
  activeDb: number;

  keys: KeyInfo[];
  keyCursor: number;
  keyMatch: string;
  keyType: RedisTypeFilter;
  keysLoading: boolean;
  keysDone: boolean;
  keysScanned: number;

  selectedKey: string | null;
  keyDetail: KeyDetail | null;
  detailLoading: boolean;

  consoleOpen: boolean;
  serverInfoOpen: boolean;
  sidebarOpen: boolean;
  activeTool: ToolKey | null;

  connectionDialogOpen: boolean;
  editingConnection: Connection | null;
  openConnectionDialog: (c?: Connection | null) => void;
  closeConnectionDialog: () => void;

  loadConnections: () => Promise<void>;
  openConnection: (id: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshDatabases: () => Promise<void>;
  setActiveDb: (db: number) => Promise<void>;
  loadKeys: (reset?: boolean) => Promise<void>;
  loadMoreKeys: () => Promise<void>;
  selectKey: (key: string | null) => Promise<void>;
  refreshKey: () => Promise<void>;
  loadMoreDetail: () => Promise<void>;
  setKeyMatch: (match: string) => void;
  setKeyType: (type: RedisTypeFilter) => void;
  afterMutation: () => Promise<void>;
  setConsoleOpen: (open: boolean) => void;
  setServerInfoOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTool: (tool: ToolKey | null) => void;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PAGE_SIZE = 200;

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  connectionsLoading: false,

  activeConnId: null,
  session: null,
  connecting: false,

  databases: [],
  activeDb: 0,

  keys: [],
  keyCursor: 0,
  keyMatch: "*",
  keyType: "all",
  keysLoading: false,
  keysDone: false,
  keysScanned: 0,

  selectedKey: null,
  keyDetail: null,
  detailLoading: false,

  consoleOpen: false,
  serverInfoOpen: false,
  sidebarOpen: false,
  activeTool: null,

  connectionDialogOpen: false,
  editingConnection: null,

  openConnectionDialog(c = null) {
    set({ connectionDialogOpen: true, editingConnection: c });
  },

  closeConnectionDialog() {
    set({ connectionDialogOpen: false, editingConnection: null });
  },

  async loadConnections() {
    set({ connectionsLoading: true });
    try {
      const connections = await api.listConnections();
      set({ connections, connectionsLoading: false });
    } catch (e) {
      set({ connectionsLoading: false });
      toast.error(`Failed to load connections: ${errMsg(e)}`);
    }
  },

  async openConnection(id: string) {
    set({ connecting: true });
    try {
      const res = await api.openSession(id);
      if (!res.ok || !res.session) {
        set({ connecting: false });
        toast.error(res.error ?? "Failed to connect");
        return;
      }
      set({
        session: res.session,
        activeConnId: id,
        connecting: false,
        selectedKey: null,
        keyDetail: null,
        keys: [],
        keyCursor: 0,
        keysDone: false,
        sidebarOpen: false,
      });
      toast.success(`Connected to ${res.session.name}`);
      await get().refreshDatabases();
      await get().setActiveDb(res.session.db ?? 0);
    } catch (e) {
      set({ connecting: false });
      toast.error(errMsg(e));
    }
  },

  async disconnect() {
    const { session } = get();
    if (session) {
      try {
        await api.closeSession(session.id);
      } catch {
        // ignore
      }
    }
    set({
      session: null,
      activeConnId: null,
      databases: [],
      activeDb: 0,
      keys: [],
      keyCursor: 0,
      keysDone: false,
      selectedKey: null,
      keyDetail: null,
      serverInfoOpen: false,
      activeTool: null,
    });
  },

  async refreshDatabases() {
    const { session, activeDb } = get();
    if (!session) return;
    try {
      const databases = await api.databases(session.id, activeDb);
      set({ databases });
    } catch (e) {
      toast.error(`Failed to load databases: ${errMsg(e)}`);
    }
  },

  async setActiveDb(db: number) {
    set({
      activeDb: db,
      keys: [],
      keyCursor: 0,
      keysDone: false,
      selectedKey: null,
      keyDetail: null,
      keysScanned: 0,
      sidebarOpen: false,
    });
    await get().loadKeys(true);
  },

  async loadKeys(reset = false) {
    const { session, activeDb, keyMatch, keyType, keyCursor } = get();
    if (!session) return;
    set({
      keysLoading: true,
      ...(reset ? { keys: [], keyCursor: 0, keysDone: false, keysScanned: 0 } : {}),
    });
    try {
      const cursor = reset ? 0 : keyCursor;
      const res = await api.scanKeys(session.id, {
        db: activeDb,
        cursor,
        match: keyMatch || "*",
        count: PAGE_SIZE,
        type: keyType,
        size: true,
      });
      const prev = reset ? [] : get().keys;
      const seen = new Set(prev.map((k) => k.key));
      const merged = [...prev];
      for (const k of res.keys) {
        if (!seen.has(k.key)) merged.push(k);
      }
      set({
        keys: merged,
        keyCursor: res.cursor,
        keysDone: res.cursor === 0,
        keysLoading: false,
        keysScanned: merged.length,
      });
    } catch (e) {
      set({ keysLoading: false });
      toast.error(`Failed to scan keys: ${errMsg(e)}`);
    }
  },

  async loadMoreKeys() {
    const { keysDone, keysLoading } = get();
    if (keysDone || keysLoading) return;
    await get().loadKeys(false);
  },

  async selectKey(key: string | null) {
    if (!key) {
      set({ selectedKey: null, keyDetail: null });
      return;
    }
    const { session, activeDb } = get();
    if (!session) return;
    set({ selectedKey: key, detailLoading: true, keyDetail: null });
    try {
      const detail = await api.getKey(session.id, { db: activeDb, key, count: 500 });
      set({ keyDetail: detail, detailLoading: false });
    } catch (e) {
      set({ detailLoading: false });
      toast.error(`Failed to load key: ${errMsg(e)}`);
    }
  },

  async refreshKey() {
    const { selectedKey } = get();
    if (selectedKey) await get().selectKey(selectedKey);
  },

  async loadMoreDetail() {
    const { session, activeDb, keyDetail } = get();
    if (!session || !keyDetail || !keyDetail.cursor) return;
    set({ detailLoading: true });
    try {
      const more = await api.getKey(session.id, {
        db: activeDb,
        key: keyDetail.key,
        cursor: keyDetail.cursor,
        count: 500,
      });
      const prev = keyDetail.value;
      const next = more.value;
      const merged =
        Array.isArray(prev) && Array.isArray(next)
          ? [...prev, ...next]
          : next;
      set({ keyDetail: { ...more, value: merged }, detailLoading: false });
    } catch (e) {
      set({ detailLoading: false });
      toast.error(`Failed to load more: ${errMsg(e)}`);
    }
  },

  setKeyMatch(match: string) {
    set({ keyMatch: match });
  },

  setKeyType(type: RedisTypeFilter) {
    set({ keyType: type });
  },

  async afterMutation() {
    await get().refreshKey();
    await get().loadKeys(true);
    void get().refreshDatabases();
  },

  setConsoleOpen(open: boolean) {
    set({ consoleOpen: open });
  },

  setServerInfoOpen(open: boolean) {
    set({ serverInfoOpen: open });
  },

  setSidebarOpen(open: boolean) {
    set({ sidebarOpen: open });
  },

  setActiveTool(tool: ToolKey | null) {
    set({ activeTool: tool });
  },
}));
