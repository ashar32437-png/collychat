"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { shrinkImage } from "@/lib/image-resize";
import { MAX_AVATAR_BYTES, STATUS_LABEL } from "@/lib/types";
import type { PresenceStatus, User } from "@/lib/types";

const STATUSES: PresenceStatus[] = ["active", "dnd"];

export default function ProfileDialog({
  me,
  onClose,
  onUpdated,
}: {
  me: User;
  onClose: () => void;
  onUpdated: (user: User) => void;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [status, setStatus] = useState<PresenceStatus>(me.status);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function uploadAvatar(raw: File) {
    setBusy(true);
    setError(null);
    try {
      // A profile picture is never more than a couple of hundred pixels wide.
      const file = await shrinkImage(raw, 256, 0.85);
      if (file.size > MAX_AVATAR_BYTES) {
        setError("Profile pictures must be under " + MAX_AVATAR_BYTES / 1_000_000 + " MB");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/users/me/avatar", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not save that picture");
        return;
      }
      const user = data.user as User;
      setAvatarUrl(user.avatarUrl);
      onUpdated(user);
    } catch {
      setError("Could not upload that picture");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Could not save your profile");
        return;
      }
      onUpdated(data.user as User);
      onClose();
    } catch {
      setError("Could not save your profile");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-line bg-base px-3 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-line-strong focus:ring-4 focus:ring-white/5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div className="card-shadow relative z-10 w-full max-w-sm rounded-2xl border border-line bg-panel p-5">
        <h2 className="text-[15px] font-semibold text-ink">Your profile</h2>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={displayName || me.username} url={avatarUrl} size={56} />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition hover:bg-raised hover:text-ink disabled:opacity-50"
            >
              Change picture
            </button>
            <p className="mt-1.5 text-xs text-faint">
              PNG, JPG, GIF, WebP — resized for you, up to 5 MB
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadAvatar(file);
            }}
          />
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
            Display name
          </span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={32}
            className={field}
          />
        </label>

        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-faint">
            Status
          </span>
          <div className="flex gap-1 rounded-lg bg-base p-1">
            {STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition " +
                  (status === value ? "bg-raised text-ink" : "text-muted hover:text-ink")
                }
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: value === "dnd" ? "var(--color-warn)" : "var(--color-online)",
                  }}
                />
                {value === "active" ? "Active" : "DND"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-faint">{STATUS_LABEL[status]}</p>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition hover:bg-raised hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
