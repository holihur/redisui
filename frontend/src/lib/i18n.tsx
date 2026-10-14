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
  "Live output of the Redis INFO command.": "Redis INFO 命令的实时输出。",
  Server: "服务器",
  Clients: "客户端",
  Memory: "内存",
  Keyspace: "键空间",
  Stats: "统计",
  Replication: "主从复制",
  Modules: "模块",
  "No modules loaded": "未加载模块",
  "no expire": "不过期",
  missing: "已过期",
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
  "Lua script": "Lua 脚本",
  "RESP proxy": "RESP 代理",
  "Transparent Redis protocol proxy: point other apps here to record uplink/downlink traffic.":
    "透明 Redis 协议代理：让其它应用连到这里，即可记录上行/下行流量。",
  "Proxy is disabled. Start the server with -proxy-addr and -proxy-target to enable it.":
    "代理未启用。启动服务时传入 -proxy-addr 与 -proxy-target 即可开启。",
  Listen: "监听",
  Target: "目标",
  "Active connections": "活动连接",
  "Total connections": "累计连接",
  Uplink: "上行",
  Downlink: "下行",
  Commands: "命令数",
  "Uplink (bytes/s)": "上行 (字节/秒)",
  "Downlink (bytes/s)": "下行 (字节/秒)",
  Remote: "远端",
  Uptime: "持续时长",
  "Last command": "最近命令",
  "Run a Lua script with EVAL; KEYS and ARGV come from the fields below.":
    "用 EVAL 运行 Lua 脚本；KEYS 与 ARGV 来自下方输入框。",
  "Keys (one per line)": "Keys（每行一个）",
  "Arguments (one per line)": "Arguments（每行一个）",
  "Run (EVAL)": "运行 (EVAL)",
  "Load (SCRIPT LOAD)": "加载 (SCRIPT LOAD)",
  "Script is required": "脚本为必填项",
  "Loaded SHA: {sha}": "已加载 SHA：{sha}",
  Result: "结果",
  "No output yet.": "暂无输出。",
  Users: "用户",
  "Access tokens": "访问令牌",
  "Personal access tokens for automation and the MCP endpoint. Scopes: read, write, admin.":
    "用于自动化与 MCP 端点的个人访问令牌。Scope：read、write、admin。",
  "New token (shown once)": "新令牌（仅显示一次）",
  "New token": "新建令牌",
  Name: "名称",
  "TTL (hours, 0 = never)": "有效期（小时，0=永久）",
  Scopes: "Scope",
  "Create token": "创建令牌",
  "{count} tokens": "{count} 个令牌",
  Created: "创建于",
  Expires: "过期于",
  "Last used": "最近使用",
  "Delete token": "删除令牌",
  "Token name is required": "令牌名称为必填项",
  "Select at least one scope": "至少选择一个 scope",
  "Token deleted": "令牌已删除",
  Copied: "已复制",
  "Copy failed": "复制失败",
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

  // editors
  Field: "字段",
  Value: "值",
  Member: "成员",
  Score: "分值",
  Index: "索引",
  Timestamp: "时间戳",
  Item: "条目",
  Count: "计数",
  Size: "大小",
  Type: "类型",
  Key: "Key",
  "Add element": "添加元素",
  "Add member": "添加成员",
  "New element": "新元素",
  "New member": "新成员",
  "Save element": "保存元素",
  "Remove element": "移除元素",
  "Save changes": "保存更改",
  "(empty)": "（空）",
  "{count} chars": "{count} 字符",
  "{count} chars · JSON": "{count} 字符 · JSON",
  "No samples": "没有样本",
  "Empty list": "空列表",
  "Empty stream": "空流",
  Push: "写入",
  "timestamp (blank = now)": "时间戳（留空＝当前）",
  value: "值",
  "item to add": "要添加的条目",
  item: "条目",
  "Invalid JSON": "JSON 无效",
  "Top items": "高频条目",
  "No data": "无数据",

  // connection dialog
  "Edit connection": "编辑连接",
  "Configure the Redis endpoint. Optionally route the connection through an SSH jump host.":
    "配置 Redis 接入点，可选通过 SSH 跳板机转发。",
  "Connection name": "连接名称",
  Mode: "模式",
  Direct: "直连",
  Sentinel: "哨兵",
  Cluster: "集群",
  Host: "主机",
  Port: "端口",
  "Master name": "主节点名称",
  "Sentinel addresses (one per line)": "哨兵地址（每行一个）",
  "Sentinel user": "哨兵用户名",
  "Sentinel password": "哨兵密码",
  "Cluster seed addresses (one per line)": "集群种子地址（每行一个）",
  Database: "数据库",
  "Use TLS": "启用 TLS",
  "Encrypt the connection to Redis (rediss://)":
    "加密到 Redis 的连接 (rediss://)",
  "Verify certificate": "验证证书",
  "Validate the server certificate chain": "校验服务器证书链",
  "Connect over SSH": "通过 SSH 连接",
  "Tunnel the Redis traffic through a jump host": "通过跳板机转发 Redis 流量",
  "SSH host": "SSH 主机",
  "SSH user": "SSH 用户",
  "SSH password": "SSH 密码",
  "•••• stored, leave empty to keep": "•••• 已保存，留空保持不变",
  Authentication: "认证方式",
  "Private key": "私钥",
  "Key passphrase": "私钥口令",
  "Pinned host key (optional)": "固定主机密钥（可选）",
  Test: "测试",
  optional: "可选",
  password: "密码",
  "•••• unchanged": "•••• 保持不变",
  "Connection successful": "连接成功",
  "Connection updated": "连接已更新",
  "Connection created": "连接已创建",
  "Testing connection…": "正在测试连接…",
  "Connection name is required": "连接名称为必填项",
  "Host is required for a direct connection": "直连模式需要填写主机",
  "Master name and at least one sentinel are required":
    "需要主节点名称和至少一个哨兵地址",
  "At least one cluster address is required": "至少需要一个集群地址",

  // new key dialog
  "New key": "新建 Key",
  "Create a key in db{db}. Empty collections cannot be stored, so the first element is required.":
    "在 db{db} 中创建 Key。空集合无法存储，因此需要第一个元素。",
  "Key name": "Key 名称",
  "Member label": "成员",
  "Push direction": "写入方向",
  "TTL (seconds, optional)": "TTL（秒，可选）",
  "Right (RPUSH)": "右端 (RPUSH)",
  "Left (LPUSH)": "左端 (LPUSH)",
  "Key name is required": "Key 名称为必填项",
  "Field is required": "字段为必填项",
  "Key created": "Key 已创建",

  // slowlog
  "The most recent commands that exceeded the server's slowlog threshold (db{db}).":
    "最近超过服务器慢查询阈值的命令（db{db}）。",
  "{count} entries": "{count} 条",
  "{count} entry": "{count} 条",
  Time: "时间",
  Duration: "耗时",
  Command: "命令",
  Client: "客户端",
  "No slow commands recorded.": "没有慢查询记录。",

  // memory
  "Server memory usage and the largest keys found in a random sample.":
    "服务器内存使用，以及随机采样中发现的最大 Key。",
  "Largest keys": "最大的 Key",
  "(sampled {count})": "（采样 {count}）",

  // clients
  "Output of CLIENT LIST.": "CLIENT LIST 的输出。",
  "{count} clients": "{count} 个客户端",
  "{count} client": "{count} 个客户端",

  // pubsub
  "Live subscription to channels and patterns (db{db}).":
    "实时订阅频道与模式（db{db}）。",
  Channels: "频道",
  Patterns: "模式",
  Subscribe: "订阅",
  Publish: "发布",
  channel: "频道",
  message: "消息",
  "Listening…": "监听中…",
  Stopped: "已停止",
  "{count} messages": "{count} 条消息",
  "No messages yet.": "暂无消息。",
  "Add at least one channel or pattern": "请至少添加一个频道或模式",
  "Published to {channel}": "已发布到 {channel}",

  // monitor
  "Streams every command the server processes. Use with care on busy servers (db{db}).":
    "实时输出服务器处理的每条命令。在繁忙服务器上请慎用（db{db}）。",
  "Filter…": "过滤…",
  "Monitoring…": "监控中…",
  "{count} lines": "{count} 行",
  "No commands yet.": "暂无命令。",

  // search
  "Query and manage search indexes (db{db}).": "查询与管理搜索索引（db{db}）。",
  Query: "查询",
  Indexes: "索引",
  "No search indexes detected. Enter an index name to query, or create one on the “Create” tab.":
    "未检测到搜索索引。可输入索引名查询，或在「创建」标签页新建。",
  "No indexes detected (this Redis may not support FT._LIST). Enter an index name to inspect it.":
    "未检测到索引（该 Redis 可能不支持 FT._LIST）。输入索引名以查看。",
  "Add field (FT.ALTER)": "新增字段 (FT.ALTER)",
  "field name": "字段名",
  SORTABLE: "SORTABLE",
  "Drop index": "删除索引",
  "Also delete indexed documents (DD)": "同时删除已索引文档 (DD)",
  "Drop {name}": "删除 {name}",
  "Index name": "索引名称",
  "Key prefixes (comma-separated, optional)": "Key 前缀（逗号分隔，可选）",
  Fields: "字段",
  "Create index": "创建索引",
  "Index name is required": "索引名称为必填项",
  "Add at least one field": "至少添加一个字段",
  "Created index {name}": "已创建索引 {name}",
  "Added field {name}": "已新增字段 {name}",
  "Dropped index {name}": "已删除索引 {name}",
  "{count} results": "{count} 条结果",
  "{count} result": "{count} 条结果",
  Prev: "上一页",
  Next: "下一页",

  // users
  "Local accounts with role-based access. Admins manage everything; operators read/write their connections; viewers are read-only.":
    "本地账号按角色授权：管理员可管理全部；操作员对其连接可读写；只读用户只能查看。",
  "New user": "新建用户",
  username: "用户名",
  "password (min 6 chars)": "密码（至少 6 位）",
  "Connection scope": "连接范围",
  "Leave all unchecked to grant access to every connection.":
    "全部不勾选表示可访问所有连接。",
  "Create user": "创建用户",
  "No connections defined": "未定义连接",
  "{count} accounts": "{count} 个账号",
  you: "你",
  "Delete user": "删除用户",
  "Username and password are required": "需要用户名和密码",
  "Created user {name}": "已创建用户 {name}",
  "Updated {name}": "已更新 {name}",
  "Deleted {name}": "已删除 {name}",

  // about / updates
  "Self-update checks GitHub releases and can apply them in place.":
    "自动更新会检查 GitHub Release 并可原地升级。",
  "Self-update is disabled on this server.": "该服务器已禁用自动更新。",
  "Current version": "当前版本",
  "Latest version": "最新版本",
  "update available": "有可用更新",
  "Auto-update": "自动更新",
  on: "开",
  off: "关",
  "Check interval": "检查间隔",
  "Last checked": "上次检查",
  never: "从未",
  "Last error": "最近错误",
  "Release notes": "更新日志",
  "Check for updates": "检查更新",
  "Update now": "立即更新",
  "Restarting…": "重启中…",
  "Only admins can trigger checks or updates.": "只有管理员可以触发检查或更新。",
  "You're up to date": "已是最新版本",
  "Update available: {version}": "有可用更新：{version}",
  "Downloading update…": "正在下载更新…",
  "Update failed": "更新失败",
  "Updated — restarting…": "已更新，正在重启…",
  "Server did not come back; refresh manually": "服务未恢复，请手动刷新",
  "Update check failed": "检查更新失败",

  // key import/export/bulk
  "Export keys": "导出 Key",
  "Dump matching keys (with TTLs) to a JSON file you can import later.":
    "将匹配的 Key（含 TTL）导出为 JSON 文件，便于之后导入。",
  Pattern: "模式",
  "Max keys": "最大数量",
  Export: "导出",
  "Import keys": "导入 Key",
  "Restore a previously exported JSON file into db{db}.":
    "将之前导出的 JSON 文件恢复到 db{db}。",
  "Export file": "导出文件",
  "Overwrite existing keys (RESTORE REPLACE)": "覆盖已存在的 Key (RESTORE REPLACE)",
  Import: "导入",
  "Delete keys by pattern": "按模式删除 Key",
  "Permanently delete every key in db{db} matching the pattern. This cannot be undone.":
    "永久删除 db{db} 中匹配该模式的所有 Key。此操作不可撤销。",
  "Type {pattern} to confirm": "输入 {pattern} 以确认",
  "the pattern": "该模式",
  "Delete keys": "删除 Key",
  "No keys found in file": "文件中没有 Key",
  "Imported {count} keys": "已导入 {count} 个 Key",
  "Exported {count} keys": "已导出 {count} 个 Key",
  "Deleted {count} keys": "已删除 {count} 个 Key",
  "{failed} failed, e.g. {first}": "{failed} 个失败，例如 {first}",
  "Type the pattern": "该模式",
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
    setModuleLang(lang);
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

// Module-level language for non-React helpers (e.g. formatTTL).
let moduleLang: Lang = "en";

export function setModuleLang(lang: Lang) {
  moduleLang = lang;
}

/** Translate outside React components. */
export function translate(
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = moduleLang === "zh" ? zh : en;
  let out = dict[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
