import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Database, KeyRound, Loader2, LogIn, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, clearAuthToken, getAuthToken, setAuthToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { UserRole } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";

function normalizeRole(r: string): UserRole {
  if (r === "full") return "admin";
  if (r === "readonly") return "viewer";
  return r === "operator" || r === "viewer" || r === "admin" ? r : "admin";
}

/**
 * Blocks the app until the server confirms access. Supports either a shared
 * access token or (when enabled) username/password login, then records the
 * principal (role + connection scope) in the store.
 */
export function TokenGate({ children }: { children: ReactNode }) {
  const setPrincipal = useAppStore((s) => s.setPrincipal);
  const { t } = useI18n();
  const [state, setState] = useState<"loading" | "locked" | "ready">("loading");
  const [multiUser, setMultiUser] = useState(false);
  const [oidc, setOidc] = useState<{ name: string; loginUrl: string } | null>(
    null,
  );
  const [tab, setTab] = useState<"login" | "token">("token");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (p: { username?: string; role: string; connections?: string[] }) => {
      setPrincipal({
        username: p.username ?? "",
        role: normalizeRole(p.role),
        connections: p.connections ?? [],
      });
      setState("ready");
    },
    [setPrincipal],
  );

  const check = useCallback(async () => {
    setError("");
    // Pick up a token returned by the OIDC callback fragment.
    const hash = window.location.hash;
    if (hash.startsWith("#oidc_token=")) {
      setAuthToken(decodeURIComponent(hash.slice("#oidc_token=".length)));
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    try {
      const status = await api.authStatus();
      setMultiUser(status.multiUser);
      setOidc(status.oidc?.enabled ? status.oidc : null);
      if (!status.required) {
        apply({ role: "admin" });
        return;
      }
      if (status.multiUser) setTab("login");
      if (getAuthToken()) {
        try {
          const res = await api.authVerify();
          apply(res);
          return;
        } catch {
          clearAuthToken();
        }
      }
      setState("locked");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Cannot reach the server"));
      setState("locked");
    }
  }, [apply]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearAuthToken();
      setState("locked");
    };
    window.addEventListener("redisui:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("redisui:unauthorized", onUnauthorized);
  }, []);

  if (state === "loading") {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-foreground">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "ready") return <>{children}</>;

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.login(username.trim(), password);
      setAuthToken(res.token);
      apply(res);
    } catch (err) {
      clearAuthToken();
      setError(err instanceof Error ? err.message : t("Login failed"));
    } finally {
      setBusy(false);
    }
  };

  const submitToken = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    setAuthToken(input.trim());
    try {
      const res = await api.authVerify();
      apply(res);
    } catch (err) {
      clearAuthToken();
      setError(err instanceof Error ? err.message : t("Invalid access token"));
    } finally {
      setBusy(false);
    }
  };

  const showTabs = multiUser;

  return (
    <div className="flex h-svh items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/15 text-red-500">
            <Database className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">RedisUI</h1>
            <p className="text-xs text-muted-foreground">
              {t(
                showTabs && tab === "login"
                  ? "Sign in to continue"
                  : "Enter the access token to continue",
              )}
            </p>
          </div>
        </div>

        {oidc ? (
          <Button
            type="button"
            className="mb-4 w-full"
            onClick={() => {
              window.location.href = oidc.loginUrl;
            }}
          >
            <LogIn className="size-4" />
            {t("Sign in with {name}", { name: oidc.name })}
          </Button>
        ) : null}

        {showTabs ? (
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                tab === "login"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {t("Sign in")}
            </button>
            <button
              type="button"
              onClick={() => setTab("token")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                tab === "token"
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {t("Access token")}
            </button>
          </div>
        ) : null}

        {tab === "login" && showTabs ? (
          <form onSubmit={submitLogin}>
            <div className="grid gap-2">
              <Label htmlFor="login-user">{t("Username")}</Label>
              <Input
                id="login-user"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="mt-3 grid gap-2">
              <Label htmlFor="login-pass">{t("Password")}</Label>
              <Input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            ) : null}
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={busy || !username.trim() || !password}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" />
              )}
              {t("Sign in")}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitToken}>
            <div className="grid gap-2">
              <Label htmlFor="access-token">{t("Access token")}</Label>
              <Input
                id="access-token"
                type="password"
                autoFocus
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("Paste the token from the server log")}
                className="font-mono"
              />
            </div>
            {error ? (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            ) : null}
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={busy || !input.trim()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {t("Unlock")}
            </Button>
          </form>
        )}

        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          <span>
            {t("The token is printed at startup and stored in")}{" "}
            <code className="font-mono">&lt;data-dir&gt;/token</code>
            {" "}
            {t("Accounts are managed by an admin under Diagnostics → Users.")}
          </span>
        </p>
      </div>
    </div>
  );
}
