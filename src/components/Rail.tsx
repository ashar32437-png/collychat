"use client";

import { Fragment, useState } from "react";
import { Avatar } from "./avatar";
import { ADMIN_TOOL, TOOL_META, TOOL_ORDER } from "./tools/meta";
import type { ToolKey } from "./tools/meta";
import { STATUS_LABEL } from "@/lib/types";
import type { User } from "@/lib/types";

type Hint = { label: string; x: number; y: number };

function RailSlot({
  label,
  active,
  onClick,
  onHint,
  onHintMove,
  onHintClear,
  children,
  tile = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onHint: (label: string, event: React.PointerEvent) => void;
  onHintMove: (event: React.PointerEvent) => void;
  onHintClear: () => void;
  children: React.ReactNode;
  tile?: boolean;
}) {
  return (
    <div
      className="group relative flex h-[52px] w-[52px] items-center justify-center"
      onPointerEnter={(event) => onHint(label, event)}
      onPointerMove={onHintMove}
      onPointerLeave={onHintClear}
    >
      <span
        className={
          "absolute -left-3.5 w-[4px] rounded-full bg-ink transition-all duration-150 " +
          (active ? "h-9 opacity-100" : "h-0 opacity-0 group-hover:h-6 group-hover:opacity-60")
        }
      />
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={
          "flex h-[52px] w-[52px] items-center justify-center transition-all duration-150 " +
          (active
            ? "rounded-2xl bg-raised text-ink"
            : "rounded-[26px] text-muted hover:rounded-2xl hover:bg-hover hover:text-ink") +
          (tile && active ? " tool-tile" : "")
        }
      >
        {children}
      </button>
    </div>
  );
}

export default function Rail({
  tool,
  onSelectMessages,
  onSelectTool,
  me,
  onOpenProfile,
  onLogout,
}: {
  tool: ToolKey | null;
  onSelectMessages: () => void;
  onSelectTool: (tool: ToolKey) => void;
  me: User;
  onOpenProfile: () => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const tools = me.isAdmin ? [...TOOL_ORDER, ADMIN_TOOL] : TOOL_ORDER;

  // The label follows the pointer, so it appears just to the right of the
  // cursor and vanishes the moment the pointer leaves the slot.
  const showHint = (label: string, event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setHint({ label, x: event.clientX, y: event.clientY });
  };
  const moveHint = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setHint((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
  };
  const clearHint = () => setHint(null);

  return (
    <nav className="relative flex w-[84px] shrink-0 flex-col items-center gap-2.5 bg-rail py-3.5">
      <RailSlot
        label="Messages"
        active={tool === null}
        onClick={onSelectMessages}
        onHint={showHint}
        onHintMove={moveHint}
        onHintClear={clearHint}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-5 4V6.5Z" />
        </svg>
      </RailSlot>

      <div className="my-1 h-px w-10 bg-line-strong" />

      {tools.map((key) => (
        <Fragment key={key}>
          {key === ADMIN_TOOL && <div className="my-1 h-px w-10 bg-line-strong" />}
          <RailSlot
            label={TOOL_META[key].label}
            active={tool === key}
            onClick={() => onSelectTool(key)}
            onHint={showHint}
            onHintMove={moveHint}
            onHintClear={clearHint}
            tile={key === "ai" || key === ADMIN_TOOL}
          >
            {TOOL_META[key].icon}
          </RailSlot>
        </Fragment>
      ))}

      <div className="relative mt-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Your account"
          className="rounded-full ring-2 ring-transparent transition hover:ring-line-strong"
        >
          <Avatar
            name={me.displayName}
            url={me.avatarUrl}
            size={44}
            active
            status={me.status}
            ringColor="var(--color-rail)"
          />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="card-shadow absolute bottom-1 left-16 z-40 w-56 origin-bottom-left rounded-xl border border-line bg-raised p-1.5">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-semibold text-ink">{me.displayName}</p>
                <p className="truncate text-xs text-faint">@{me.username}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        me.status === "dnd" ? "var(--color-warn)" : "var(--color-online)",
                    }}
                  />
                  {STATUS_LABEL[me.status]}
                </p>
              </div>
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenProfile();
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-hover hover:text-ink"
              >
                Change profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-hover hover:text-danger"
              >
                Log out
              </button>
            </div>
          </>
        )}
      </div>

      {hint && (
        <div
          className="card-shadow pointer-events-none fixed z-[80] -translate-y-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-xs font-semibold text-ink"
          style={{ left: hint.x + 16, top: hint.y }}
          role="tooltip"
        >
          {hint.label}
        </div>
      )}
    </nav>
  );
}
