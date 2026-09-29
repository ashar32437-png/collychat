"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../avatar";
import type { User } from "@/lib/types";

export default function AdminTool({ me }: { me: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function setApproved(userId: number, approved: boolean) {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, approved }),
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
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <Avatar
                name={user.displayName}
                url={user.avatarUrl}
                size={36}
                active={user.approved}
                status={user.status}
                ringColor="var(--color-surface)"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[15px] font-medium text-ink">
                  {user.displayName}
                  {user.isAdmin && (
                    <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Admin
                    </span>
                  )}
                  {!user.approved && (
                    <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                      Pending
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-faint">@{user.username}</p>
              </div>

              <button
                type="button"
                disabled={busyId === user.id}
                onClick={() => void setApproved(user.id, !user.approved)}
                className={
                  "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 " +
                  (user.approved
                    ? "border border-line text-muted hover:bg-raised hover:text-ink"
                    : "bg-accent font-semibold text-on-accent hover:bg-accent-strong")
                }
              >
                {user.approved ? "Revoke" : "Approve"}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 px-1 text-xs text-faint">
          You are signed in as @{me.username}.
        </p>
      </div>
    </div>
  );
}
