"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./avatar";
import type { User } from "@/lib/types";

export default function PendingPanel({
  user,
  onApproved,
  onLogout,
}: {
  user: User;
  onApproved: (user: User) => void;
  onLogout: () => void;
}) {
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.user?.approved) onApproved(data.user as User);
    } catch {
      /* keep waiting */
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => void check(), 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base px-4">
      <div className="grid-lines pointer-events-none absolute inset-0" />

      <div className="card-shadow relative z-10 w-full max-w-sm rounded-2xl border border-line bg-panel p-6 text-center">
        <div className="flex justify-center">
          <Avatar name={user.displayName} url={user.avatarUrl} size={56} />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
          Waiting for approval
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          <span className="text-ink">{user.displayName}</span>, an admin has to approve your
          account before you can chat.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void check()}
            disabled={checking}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-60"
          >
            {checking ? "Checking…" : "Check again"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-raised hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
