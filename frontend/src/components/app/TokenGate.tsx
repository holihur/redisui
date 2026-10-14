import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Database, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, clearAuthToken, getAuthToken, setAuthToken } from "@/lib/api";

/**
 * TokenGate blocks the app until the server confirms access. When the server
 * runs without authentication it passes straight through, so the same build
 * works for local and remote deployments.
 */
export function TokenGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "locked" | "ready">("loading");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setError("");
    try {
      const { required } = await api.authStatus();
      if (!required) {
        setState("ready");
        return;
      }
      if (getAuthToken()) {
        try {
          await api.authVerify();
          setState("ready");
          return;
        } catch {
          clearAuthToken();
        }
      }
      setState("locked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the server");
      setState("locked");
    }
  }, []);

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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setError("");
    setAuthToken(input.trim());
    try {
      await api.authVerify();
      setState("ready");
    } catch (err) {
      clearAuthToken();
      setError(err instanceof Error ? err.message : "Invalid access token");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-svh items-center justify-center bg-background p-4 text-foreground">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-red-500/15 text-red-500">
            <Database className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold">RedisUI</h1>
            <p className="text-xs text-muted-foreground">
              Enter the access token to continue
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="access-token">Access token</Label>
          <Input
            id="access-token"
            type="password"
            autoFocus
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste the token from the server log"
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
          Unlock
        </Button>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          <span>
            The token is printed at startup and stored in{" "}
            <code className="font-mono">&lt;data-dir&gt;/token</code>. Override it
            with <code className="font-mono">-auth-token</code> or{" "}
            <code className="font-mono">REDISUI_AUTH_TOKEN</code>.
          </span>
        </p>
      </form>
    </div>
  );
}
