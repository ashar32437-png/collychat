"use client";

import { useMemo, useState } from "react";
import { Avatar } from "./avatar";
import type { DmItem } from "@/lib/types";

export default function GroupDialog({
  people,
  onClose,
  onCreate,
  busy,
  error,
}: {
  people: DmItem[];
  onClose: () => void;
  onCreate: (name: string, memberIds: number[]) => void;
  busy: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...people]
      .filter((person) => !needle || person.displayName.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [people, query]);

  const suggested = useMemo(() => {
    const names = selected
      .map((id) => people.find((person) => person.userId === id)?.displayName.split(" ")[0])
      .filter(Boolean);
    return names.slice(0, 3).join(", ") + (names.length > 3 ? " +" + (names.length - 3) : "");
  }, [selected, people]);

  function toggle(userId: number) {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="card-shadow w-full max-w-md rounded-2xl border border-line-strong bg-panel p-5">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">New conversation</h2>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder={suggested ? suggested : "Group name (optional)"}
          className="mt-4 w-full rounded-lg border border-line bg-base px-3.5 py-2.5 text-ink outline-none transition placeholder:text-faint focus:border-line-strong focus:ring-4 focus:ring-white/5"
        />

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          className="mt-2 w-full rounded-lg border border-line bg-base px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-line-strong"
        />

        <div className="mt-3 max-h-60 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-surface p-2">
          {visible.length === 0 && (
            <p className="px-2 py-5 text-center text-sm text-faint">
              {people.length === 0
                ? "Nobody else has signed up yet — share the link first."
                : "No one matches that search."}
            </p>
          )}
          {visible.map((person) => {
            const checked = selected.includes(person.userId);
            return (
              <button
                key={person.userId}
                type="button"
                onClick={() => toggle(person.userId)}
                className={
                  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition " +
                  (checked ? "bg-raised" : "hover:bg-raised/60")
                }
              >
                <Avatar
                  name={person.displayName}
                  url={person.avatarUrl}
                  size={32}
                  active={person.active}
                  status={person.status}
                  ringColor="var(--color-surface)"
                />
                <span className="flex-1 truncate text-sm text-ink">{person.displayName}</span>
                {person.active && (
                  <span className="text-[10px] uppercase tracking-wider text-online">active</span>
                )}
                <span
                  className={
                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition " +
                    (checked
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line-strong text-transparent")
                  }
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.length === 0 || busy}
            onClick={() => onCreate(name.trim(), selected)}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Working…" : selected.length === 1 ? "Start a DM" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}
