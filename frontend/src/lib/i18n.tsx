import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "en" | "zh";

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
];

const STORAGE_KEY = "redisui-lang";

// English is the source language: keys are the English strings, so `en` needs
// no entries and untranslated keys fall back to English.
const en: Record<string, string> = {};

const zh: Record<string, string> = {
  // common
  Save: "保存",
  Cancel: "取消",
  Delete: "删除",
  Add: "添加",
  New: "新建",
  "More actions": "更多操作",
  Create: "创建",
  Close: "关闭",
  Refresh: "刷新",
  Reset: "重置",
  Format: "格式化",
  Preview: "预览",
  Edit: "编辑",
  "Loading…": "加载中…",
  "Load more": "加载更多",
  Run: "执行",
  Clear: "清空",
  Stop: "停止",
  Start: "启动",
  Search: "搜索",
  "Add field": "添加字段",
  "Add sample": "添加样本",

  // login
  "Enter the access token to continue": "输入访问令牌以继续",
  "Sign in to continue": "登录以继续",
  "Sign in": "登录",
  "Access token": "访问令牌",
  "Paste the token from the server log": "粘贴服务端日志中的令牌",
  Unlock: "解锁",
  Username: "用户名",
  Password: "密码",
  "Invalid access token": "访问令牌无效",
  "Login failed": "登录失败",
  "Cannot reach the server": "无法连接服务器",
  "The token is printed at startup and stored in": "令牌在启动时打印，保存在",
  "Accounts are managed by an admin under Diagnostics → Users.":
    "账号由管理员在「诊断工具 → 用户」中管理。",

  // header
  "Not connected": "未连接",
  "Open connections": "打开连接列表",
  "Show connections": "显示连接列表",
  "Hide connections": "隐藏连接列表",
  "Command console (Ctrl/Cmd+K)": "命令控制台 (Ctrl/Cmd+K)",
  "Server information": "服务器信息",
  Diagnostics: "诊断工具",
  "Toggle theme": "切换主题",
  Appearance: "外观",
  Light: "浅色",
  Dark: "深色",
  Accent: "主题色",
  Language: "语言",
  Disconnect: "断开连接",
  Connection: "连接",
  "New connection": "新建连接",
  "Slow log": "慢查询日志",
  "Memory analysis": "内存分析",
  "Connected clients": "客户端连接",
  "Pub/Sub monitor": "发布/订阅监控",
  "Profiler (MONITOR)": "性能分析 (MONITOR)",
  "Search (RediSearch)": "搜索 (RediSearch)",
  Users: "用户",
  "About & updates": "关于与更新",

  // sidebar
  Connections: "连接",
  "No connections yet.": "还没有连接。",
  "Add connection": "添加连接",
  "Loading databases…": "加载数据库…",
  "Keys loaded": "已加载 Key",
  "Delete connection?": "删除连接？",
  "Duplicate": "复制",
  "Edit…": "编辑…",
  "Test connection": "测试连接",
  Connect: "连接",
  "Connection duplicated": "连接已复制",
  "Connection deleted": "连接已删除",
  "Connection failed": "连接失败",
  "“{name}” will be permanently removed. This does not affect the Redis server.":
    "“{name}” 将被永久删除。这不会影响 Redis 服务器。",
  "Testing {name}…": "正在测试 {name}…",
  "Connected to {name}": "已连接到 {name}",

  // empty state
  "No active connection": "没有活动连接",
  "Select a connection from the sidebar, or create a new one. SSH tunnels are supported for reaching private Redis instances.":
    "从左侧选择一个连接，或新建一个。支持通过 SSH 隧道访问内网 Redis 实例。",
  "Direct / TLS": "直连 / TLS",
  "SSH tunnel": "SSH 隧道",
  "Command console": "命令控制台",

  // key browser
  "Pattern, e.g. user:*": "匹配模式，例如 user:*",
  "Delete selected key": "删除选中的 Key",
  "No keys found in db{db}": "db{db} 中没有找到 Key",
  "{count} keys loaded": "已加载 {count} 个 Key",
  "{count} key loaded": "已加载 {count} 个 Key",
  " · more available": " · 还有更多",
  "Expand all": "全部展开",
  "Collapse all": "全部收起",
  "Export keys…": "导出 Key…",
  "Import keys…": "导入 Key…",
  "Delete by pattern…": "按模式删除…",
  "Delete key?": "删除 Key？",

  // key detail
  "Back to keys": "返回列表",
  "Rename": "重命名",
  "Set TTL": "设置 TTL",
  "Delete key": "删除 Key",
  "Rename key": "重命名 Key",
  "New key name": "新的 Key 名称",
  Expiration: "过期时间",
  "TTL (seconds)": "TTL（秒）",
  "Remove expiration": "移除过期",
  "Set expiration": "设置过期",
  "Load more ({count} remaining)": "加载更多（剩余 {count}）",

  // command console
  Console: "控制台",
  "Hide (Ctrl/Cmd+K)": "隐藏 (Ctrl/Cmd+K)",
  "Type a Redis command and press Enter. Use ↑/↓ for history.":
    "输入 Redis 命令并回车。使用 ↑/↓ 浏览历史。",
};

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

function detectLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = lang === "zh" ? zh : en;
      let out = dict[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          out = out.split(`{${k}}`).join(String(v));
        }
      }
      return out;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
