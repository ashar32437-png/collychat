"use client";

import { Avatar, initials, toneFor } from "./avatar";
import { STATUS_LABEL } from "@/lib/types";
import type { Conversation, User } from "@/lib/types";
import type { SidebarItem } from "@/lib/sidebar";

function Row({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "group mb-0.5 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[15px] transition " +
        (active ? "bg-raised text-ink" : "text-muted hover:bg-raised/70 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

export default function Sidebar({
  me,
  rooms,
  items,
  activeConversationId,
  activeUserId,
  onOpenRoom,
  onOpenItem,
  onNewGroup,
  onOpenProfile,
  onLogout,
  hiddenOnMobile,
}: {
  me: User;
  rooms: Conversation[];
  items: SidebarItem[];
  activeConversationId: number | null;
  activeUserId: number | null;
  onOpenRoom: (conversationId: number) => void;
  onOpenItem: (item: SidebarItem) => void;
  onNewGroup: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  hiddenOnMobile: boolean;
}) {
  return (
    <aside
      className={
        "flex w-72 shrink-0 flex-col border-r border-line bg-panel " +
        (activeConversationId == null && activeUserId == null && !hiddenOnMobile
          ? ""
          : "hidden md:flex")
      }
    >
      <div className="flex-1 overflow-y-auto px-2.5 pb-2 pt-3.5">
        {rooms.map((room) => (
          <Row
            key={room.id}
            active={activeConversationId === room.id && activeUserId == null}
            onClick={() => onOpenRoom(room.id)}
            title={"#" + room.name}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-[17px] text-faint">
              #
            </span>
            <span className="truncate">{room.name}</span>
          </Row>
        ))}

        <div className="flex items-center gap-2 px-2 pb-1 pt-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">
            Direct messages
          </p>
          <span className="h-px flex-1 bg-line" />
          <button
            type="button"
            onClick={onNewGroup}
            title="New group chat"
            aria-label="New group chat"
            className="flex h-6 w-6 items-center justify-center rounded text-faint transition hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {items.length === 0 && (
          <p className="px-2 py-3 text-sm text-faint">Nobody else is here yet.</p>
        )}

        {items.map((item) =>
          item.kind === "group" ? (
            <Row
              key={"group-" + item.id}
              active={activeConversationId === item.id && activeUserId == null}
              onClick={() => onOpenItem(item)}
              title={item.name}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white"
                style={{ background: toneFor(item.name) }}
              >
                {initials(item.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="text-[12px] text-faint">{item.memberCount}</span>
            </Row>
          ) : (
            <Row
              key={"dm-" + item.userId}
              active={activeUserId === item.userId}
              onClick={() => onOpenItem(item)}
              title={item.name}
            >
              <Avatar
                name={item.name}
                url={item.avatarUrl}
                size={34}
                active={item.active}
                status={item.status}
                ringColor="var(--color-panel)"
                square
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
            </Row>
          )
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-line bg-surface px-3 py-2.5">
        <button
          type="button"
          onClick={onOpenProfile}
          title="Your profile"
          className="rounded-full ring-2 ring-transparent transition hover:ring-line-strong"
        >
          <Avatar
            name={me.displayName}
            url={me.avatarUrl}
            size={36}
            active
            status={me.status}
            ringColor="var(--color-surface)"
          />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="min-w-0 flex-1 text-left"
          title="Your profile"
        >
          <p className="truncate text-[15px] font-medium text-ink">{me.displayName}</p>
          <p className="truncate text-[11px] text-muted">{STATUS_LABEL[me.status]}</p>
        </button>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
          className="rounded-md p-1.5 text-faint transition hover:bg-raised hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" />
            <path d="M10 17l-5-5 5-5M5 12h9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
