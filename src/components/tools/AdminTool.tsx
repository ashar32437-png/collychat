"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Avatar } from "../avatar";
import { MUTE_OPTIONS, isBanned, isMuted } from "@/lib/types";
import type { User } from "@/lib/types";

const untilLabel = (iso: string) => new Date(iso).toLocaleString();

function Badge({ tone, children }: { tone: "warn" | "danger" | "muted"; children: ReactNode }) {
  const styles =
    tone === "warn"
      ? "bg-warn/15 text-warn"
      : tone === "danger"
        ? "bg-danger/15 text-danger"
        : "bg-elevated text-muted";
  return (
    <span
      className={
        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + styles
      }
    >
      {children}
    </span>
  );
}

export default function AdminTool({
  me,
  onPreviewUser,
}: {
  me: User;
  onPreviewUser?: (user: User) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number>(60);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not load accounts");
        return;
      }
      setUsers(data.users as User[]);
      setPending(Number(data.pending) || 0);
      setError(null);
    } catch {
      setError("Could not load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function update(userId: number, patch: Record<string, unknown>) {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not update that account");
        return;
      }
      await load();
    } catch {
      setError("Could not update that account");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-3 flex items-center gap-3 px-1">
          <h2 className="text-[15px] font-semibold text-ink">Accounts</h2>
          <span className="flex-1" />
          {pending > 0 && (
            <span className="rounded-full bg-warn/15 px-2.5 py-1 text-xs font-medium text-warn">
              {pending} waiting
            </span>
          )}
          <span className="text-xs text-faint">{users.length} total</span>
        </div>

        {error && (
          <p className="mb-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="space-y-2">
          {loading && <p className="px-1 text-sm text-faint">Loading…</p>}
          {users.map((user) => {
            const muted = isMuted(user);
            const banned = isBanned(user);
            const isMe = user.id === me.id;
            const open = openId === user.id;
            const busy = busyId === user.id;

            return (
              <div key={user.id} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={user.displayName}
                    url={user.avatarUrl}
                    size={36}
                    active={user.approved && !banned}
                    status={user.status}
                    ringColor="var(--color-surface)"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                      <span className="truncate">{user.displayName}</span>
                      {user.isAdmin && <Badge tone="muted">Admin</Badge>}
                      {!user.approved && <Badge tone="warn">Pending</Badge>}
                      {muted && <Badge tone="warn">Muted</Badge>}
                      {banned && <Badge tone="danger">Suspended</Badge>}
                    </p>
                    <p className="truncate text-xs text-faint">
                      @{user.username}
                      {muted && " · muted until " + untilLabel(user.mutedUntil as string)}
                      {banned && " · suspended until " + untilLabel(user.bannedUntil as string)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busy || isMe}
                    onClick={() => void update(user.id, { approved: !user.approved })}
                    className={
                      "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-40 " +
                      (user.approved
                        ? "border border-line text-muted hover:bg-raised hover:text-ink"
                        : "bg-accent font-semibold text-on-accent hover:bg-accent-strong")
                    }
                  >
                    {user.approved ? "Revoke" : "Approve"}
                  </button>

                  <button
                    type="button"
                    disabled={isMe}
                    onClick={() => setOpenId(open ? null : user.id)}
                    className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
                  >
                    {open ? "Close" : "Manage"}
                  </button>
                </div>

                {open && (
                  <div className="mt-3 rounded-lg border border-line-strong bg-base/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-faint" htmlFor={"len-" + user.id}>
                        For
                      </label>
                      <select
                        id={"len-" + user.id}
                        value={minutes}
                        onChange={(event) => setMinutes(Number(event.target.value))}
                        className="rounded-lg border border-line bg-base px-2.5 py-1.5 text-sm text-ink outline-none focus:border-line-strong"
                      >
                        {MUTE_OPTIONS.map((option) => (
                          <option key={option.minutes} value={option.minutes}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void update(user.id, { muteMinutes: minutes })}
                        className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-1.5 text-sm font-medium text-warn transition hover:bg-warn/20 disabled:opacity-40"
                      >
                        Mute
                      </button>
                      <button
                        type="button"
                        disabled={busy || !muted}
                        onClick={() => void update(user.id, { muteMinutes: null })}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
                      >
                        Unmute
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-faint">Suspend:</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void update(user.id, { banMinutes: minutes })}
                        className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/20 disabled:opacity-40"
                      >
                        Suspend {MUTE_OPTIONS.find((o) => o.minutes === minutes)?.label ?? ""}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !banned}
                        onClick={() => void update(user.id, { banMinutes: null })}
                        className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
                      >
                        Lift suspension
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                      <button
                        type="button"
                        disabled={!onPreviewUser}
                        onClick={() => onPreviewUser?.(user)}
                        className="rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-hover disabled:opacity-40"
                      >
                        View their account
                      </button>
                      <span className="text-xs text-faint">
                        Read-only: their DMs and groups, exactly as they see them.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 px-1 text-xs text-faint">
          You are signed in as @{me.username}. Muting silences a person; suspending locks them out
          until the time you pick.
        </p>
      </div>
    </div>
  );
}
