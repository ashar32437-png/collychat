"use client";

import { useState } from "react";
import {
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
} from "@/lib/types";
import type { User } from "@/lib/types";

export default function AuthPanel({
  onAuthed,
  dbError = false,
}: {
  onAuthed: (user: User) => void;
  /** the server can't reach its database, so nothing on this screen can succeed */
  dbError?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const name = username.trim().toLowerCase();

    if (name.length < MIN_USERNAME_LENGTH || name.length > MAX_USERNAME_LENGTH) {
      setError(
        "Username must be " + MIN_USERNAME_LENGTH + "-" + MAX_USERNAME_LENGTH + " characters"
      );
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("Password must be at least " + MIN_PASSWORD_LENGTH + " characters");
      return;
    }
    if (isRegister && password !== confirm) {
      setError("The two passwords don't match");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/" + (isRegister ? "register" : "login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Something went wrong");
        return;
      }
      onAuthed(data.user as User);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-line bg-base px-3 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-line-strong focus:ring-4 focus:ring-white/5";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base px-4">
      <div className="grid-lines pointer-events-none absolute inset-0" />

      <div className="relative z-10 w-full max-w-sm">
        <h1 className="text-center text-[26px] font-semibold tracking-tight text-ink">
          Just a messaging app.
        </h1>

        {dbError && (
          <p className="mt-6 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-xs leading-relaxed text-warn">
            <span className="font-semibold">The server can't reach its database.</span> Signing in
            and creating an account will both fail until that is fixed — check the value of
            DATABASE_URL in the environment the app is running on.
          </p>
        )}

        <div className="card-shadow mt-7 rounded-2xl border border-line bg-panel p-5">
          <div className="mb-5 flex gap-1 rounded-lg bg-base p-1">
            {(["login", "register"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition " +
                  (mode === value ? "bg-raised text-ink" : "text-muted hover:text-ink")
                }
              >
                {value === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
                Username
              </span>
              <input
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                maxLength={MAX_USERNAME_LENGTH}
                autoComplete="username"
                spellCheck={false}
                className={field}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
                Password
              </span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                className={field}
              />
            </label>

            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
                  Confirm password
                </span>
                <input
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  className={field}
                />
              </label>
            )}

            {error && (
              <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent py-2.5 font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "One moment…" : isRegister ? "Create account" : "Log in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
