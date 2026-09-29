"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthPanel from "./AuthPanel";
import Composer, { type ComposerPayload } from "./Composer";
import GroupDialog from "./GroupDialog";
import MessageList from "./MessageList";
import PendingPanel from "./PendingPanel";
import ProfileDialog from "./ProfileDialog";
import Rail from "./Rail";
import Sidebar from "./Sidebar";
import AdminTool from "./tools/AdminTool";
import AiTool from "./tools/AiTool";
import Calculator from "./tools/Calculator";
import LinksTool from "./tools/LinksTool";
import NotesTool from "./tools/NotesTool";
import TimerTool from "./tools/TimerTool";
import { TOOL_META, TOOL_ORDER } from "./tools/meta";
import type { ToolKey } from "./tools/meta";
import { Avatar } from "./avatar";
import { buildSidebarItems } from "@/lib/sidebar";
import type { DmSidebarItem, SidebarItem } from "@/lib/sidebar";
import type { Conversation, ConversationInfo, DmItem, GroupItem, Message, SyncResponse, User } from "@/lib/types";

function useInterval(callback: () => void, delay: number | null) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => ref.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function mergeMessages(previous: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return previous;
  const seen = new Set(previous.map((message) => message.id));
  const merged = [...previous];
  for (const message of incoming) if (!seen.has(message.id)) merged.push(message);
  merged.sort((a, b) => a.id - b.id);
  return merged;
}

const toInfo = (conversation: {
  id: number;
  kind: Conversation["kind"];
  name: string;
  slug: string | null;
  members?: User[];
}): ConversationInfo => ({
  id: conversation.id,
  kind: conversation.kind,
  name: conversation.name,
  slug: conversation.slug,
  members: conversation.members ?? [],
});

function ToolHeader({ tool, onClose }: { tool: ToolKey; onClose: () => void }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
      <span className="tool-tile flex h-8 w-8 items-center justify-center rounded-lg">
        {TOOL_META[tool].icon}
      </span>
      <h1 className="truncate text-[15px] font-semibold text-ink">{TOOL_META[tool].label}</h1>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-raised hover:text-ink"
      >
        Close
      </button>
    </header>
  );
}

export default function App() {
  const [me, setMe] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  /** the server could not reach its database — signing in cannot work */
  const [dbError, setDbError] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [mountedTools, setMountedTools] = useState<ToolKey[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  const [conv, setConv] = useState<ConversationInfo | null>(null);
  const [pendingDm, setPendingDm] = useState<DmSidebarItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dms, setDms] = useState<DmItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [rooms, setRooms] = useState<Conversation[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const convKeyRef = useRef("none");
  const lastIdRef = useRef(0);
  const nearBottomRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const syncQueuedRef = useRef(false);

  useEffect(() => {
    if (!activeTool) return;
    setMountedTools((previous) =>
      previous.includes(activeTool) ? previous : [...previous, activeTool]
    );
  }, [activeTool]);

  // ------------------------------------------------------------- bootstrap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.user) setMe(data.user as User);
        setDbError(Boolean(data?.dbError));
      } catch {
        /* offline — show the login screen */
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------ sync
  const runSync = useCallback(async () => {
    if (!me?.approved) return;
    const key = convKeyRef.current;
    const conversationId = key.startsWith("c:") ? Number(key.slice(2)) : null;
    const afterId = lastIdRef.current;

    let data: SyncResponse;
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, afterId }),
        cache: "no-store",
        // Give up on a wedged server instead of waiting on it forever.
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401) {
        setMe(null);
        return;
      }
      if (!res.ok) throw new Error("sync failed: " + res.status);
      data = (await res.json()) as SyncResponse;
    } catch {
      // Returning quietly is what used to strand the pane on "Loading…" for
      // good: nothing ever cleared `loadingMessages`, so a server that stopped
      // answering looked like an app that had frozen. Say what is happening,
      // and leave the poll running — it recovers on its own.
      setSyncFailed(true);
      return;
    }
    setSyncFailed(false);
    if (key !== convKeyRef.current) return;

    setDms(data.dms ?? []);
    setGroups(data.groups ?? []);
    setRooms(data.channels ?? []);
    setActiveUsers(data.active ?? []);
    if (data.me) setMe(data.me);
    if (data.conversation) setConv(data.conversation);

    if (Array.isArray(data.messages)) {
      if (afterId === 0) {
        setMessages(data.messages);
        lastIdRef.current = data.messages.length
          ? data.messages[data.messages.length - 1].id
          : 0;
        setLoadingMessages(false);
      } else if (data.messages.length > 0) {
        setMessages((previous) => mergeMessages(previous, data.messages ?? []));
        lastIdRef.current = Math.max(
          lastIdRef.current,
          data.messages[data.messages.length - 1].id
        );
      }
    }
  }, [me?.approved]);

  /**
   * The poll is the app's heartbeat, so it must never overlap itself.
   *
   * The interval fires every 2.5s whether or not the last request has come
   * back. While the server answers quickly that is harmless, but the moment one
   * tick runs slow — a cold database, a busy connection pool, a blip — the next
   * tick stacks up behind it and the one after that stacks behind *that*. The
   * backlog only grows, so nothing new ever renders and the app sits on
   * "Loading" until someone reloads. One request at a time means the queue can
   * never be deeper than one, and recovery is automatic.
   */
  const sync = useCallback(async () => {
    if (!me?.approved) return;
    if (syncingRef.current) {
      // Remember it rather than dropping it, so opening a conversation still
      // refreshes promptly instead of waiting for the next tick.
      syncQueuedRef.current = true;
      return;
    }
    syncingRef.current = true;
    try {
      await runSync();
    } finally {
      syncingRef.current = false;
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false;
        void sync();
      }
    }
  }, [me?.approved, runSync]);

  useInterval(sync, me?.approved ? 2500 : null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && nearBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  // Keyed on id + approval so the sync itself refreshing `me` can't loop.
  const meKey = me ? me.id + ":" + (me.approved ? "1" : "0") : "";
  useEffect(() => {
    if (meKey.endsWith(":1")) void sync();
  }, [meKey, sync]);

  // ----------------------------------------------------------- navigation
  function openConversation(conversationId: number, info?: ConversationInfo | null) {
    setActiveTool(null);
    convKeyRef.current = "c:" + conversationId;
    lastIdRef.current = 0;
    nearBottomRef.current = true;
    setMessages([]);
    setConv(info ?? null);
    setPendingDm(null);
    setLoadingMessages(true);
    void sync();
  }

  function openDm(item: SidebarItem) {
    setActiveTool(null);
    if (item.kind === "group") {
      openConversation(
        item.id,
        toInfo({ id: item.id, kind: "group", name: item.name, slug: null })
      );
      return;
    }
    if (item.id != null) {
      openConversation(item.id);
      return;
    }
    convKeyRef.current = "none";
    lastIdRef.current = 0;
    setMessages([]);
    setConv(null);
    setPendingDm(item);
    setLoadingMessages(false);
    void sync();
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    convKeyRef.current = "none";
    setMessages([]);
    setConv(null);
    setPendingDm(null);
    setActiveTool(null);
    setMountedTools([]);
    setProfileOpen(false);
    setDms([]);
    setGroups([]);
    setRooms([]);
    setActiveUsers([]);
    setError(null);
    setMe(null);
  }

  // --------------------------------------------------------------- actions
  async function send(payload: ComposerPayload): Promise<boolean> {
    const current = me;
    if (!current?.approved) return false;
    let conversationId = convKeyRef.current.startsWith("c:")
      ? Number(convKeyRef.current.slice(2))
      : null;

    try {
      if (conversationId == null) {
        if (!pendingDm) return false;
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "dm", userId: pendingDm.userId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "Could not open that DM");
          return false;
        }
        conversationId = data.id as number;
        convKeyRef.current = "c:" + conversationId;
        lastIdRef.current = 0;
        setMessages([]);
        setConv(toInfo(data));
        setPendingDm(null);
      }

      const res = await fetch("/api/conversations/" + conversationId + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Message failed to send");
        return false;
      }
      const message = data as Message;
      setMessages((previous) => mergeMessages(previous, [message]));
      lastIdRef.current = Math.max(lastIdRef.current, message.id);
      nearBottomRef.current = true;
      setError(null);
      void sync();
      return true;
    } catch {
      setError("Message failed to send");
      return false;
    }
  }

  async function createGroup(name: string, memberIds: number[]) {
    setGroupBusy(true);
    setGroupError(null);
    try {
      const payload =
        memberIds.length === 1
          ? { kind: "dm", userId: memberIds[0] }
          : { kind: "group", name, memberIds };
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGroupError(typeof data?.error === "string" ? data.error : "Could not create that chat");
        return;
      }
      setShowGroupDialog(false);
      openConversation(data.id as number, toInfo(data));
      await sync();
    } catch {
      setGroupError("Could not create that chat");
    } finally {
      setGroupBusy(false);
    }
  }

  const sidebarItems = useMemo(() => buildSidebarItems(groups, dms), [groups, dms]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-base text-sm text-faint">
        Loading…
      </div>
    );
  }

  if (!me) {
    return <AuthPanel onAuthed={(user) => setMe(user)} dbError={dbError} />;
  }

  if (!me.approved) {
    return (
      <PendingPanel user={me} onApproved={(user) => setMe(user)} onLogout={() => void logout()} />
    );
  }

  const currentUser: User = me;
  const activeConversationId = conv?.id ?? null;
  const activeUserId = pendingDm?.userId ?? null;

  const dmPartner =
    conv?.kind === "dm" ? dms.find((item) => item.conversationId === conv.id) ?? null : null;

  const partnerName = pendingDm
    ? pendingDm.name
    : dmPartner
      ? dmPartner.displayName
      : null;
  const partnerAvatar = pendingDm ? pendingDm.avatarUrl : dmPartner?.avatarUrl ?? null;
  const partnerStatus = pendingDm ? pendingDm.status : dmPartner?.status ?? "active";
  const partnerActive = pendingDm ? true : dmPartner ? dmPartner.active : false;

  const title = conv
    ? conv.kind === "channel"
      ? conv.name
      : conv.kind === "dm"
        ? partnerName ?? "Direct message"
        : conv.name
    : pendingDm
      ? pendingDm.name
      : "";

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    nearBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const showMain = activeTool != null || activeConversationId != null || pendingDm != null;
  const hasConversation = activeConversationId != null || pendingDm != null;

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <Rail
        tool={activeTool}
        onSelectMessages={() => setActiveTool(null)}
        onSelectTool={(tool) => setActiveTool(tool)}
        me={currentUser}
        onOpenProfile={() => setProfileOpen(true)}
        onLogout={() => void logout()}
      />

      <Sidebar
        me={currentUser}
        rooms={rooms}
        items={sidebarItems}
        activeConversationId={activeConversationId}
        activeUserId={activeUserId}
        onOpenRoom={(conversationId) => openConversation(conversationId)}
        onOpenItem={openDm}
        onNewGroup={() => {
          setGroupError(null);
          setShowGroupDialog(true);
        }}
        onOpenProfile={() => setProfileOpen(true)}
        onLogout={() => void logout()}
        hiddenOnMobile={activeTool != null}
      />

      <main className={"min-w-0 flex-1 flex-col md:flex " + (showMain ? "flex" : "hidden")}>
        {mountedTools.map((key) => (
          <div
            key={key}
            className={(activeTool === key ? "flex" : "hidden") + " h-full min-h-0 flex-col"}
          >
            <ToolHeader tool={key} onClose={() => setActiveTool(null)} />
            <div className="min-h-0 flex-1 overflow-hidden">
              {key === "links" && <LinksTool />}
              {key === "calculator" && <Calculator active={activeTool === "calculator"} />}
              {key === "timer" && <TimerTool />}
              {key === "notes" && <NotesTool />}
              {key === "ai" && <AiTool />}
              {key === "admin" && currentUser.isAdmin && <AdminTool me={currentUser} />}
            </div>
          </div>
        ))}

        {activeTool === null &&
          (hasConversation ? (
            <>
              <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
                <button
                  type="button"
                  onClick={() => {
                    convKeyRef.current = "none";
                    setMessages([]);
                    setConv(null);
                    setPendingDm(null);
                  }}
                  className="text-muted transition hover:text-ink md:hidden"
                  aria-label="Back"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {conv?.kind === "group" ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-raised text-[11px] font-semibold text-muted">
                    {conv.members.length}
                  </span>
                ) : conv?.kind === "channel" ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-raised text-sm text-faint">
                    #
                  </span>
                ) : (
                  <Avatar
                    name={partnerName ?? "?"}
                    url={partnerAvatar}
                    size={24}
                    active={partnerActive}
                    status={partnerStatus}
                    ringColor="var(--color-base)"
                  />
                )}

                <h1 className="truncate text-[15px] font-semibold text-ink">{title}</h1>

                {syncFailed && (
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-warn">
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                    Reconnecting…
                  </span>
                )}
              </header>

              {error && (
                <p className="flex items-center gap-2 border-b border-danger/25 bg-danger/10 px-4 py-2 text-sm text-danger">
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => setError(null)} className="hover:text-ink">
                    ✕
                  </button>
                </p>
              )}

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 pb-2 pt-3"
              >
                {loadingMessages ? (
                  <p className="pt-10 text-center text-sm text-faint">
                    {syncFailed ? "Reconnecting…" : "Loading…"}
                  </p>
                ) : messages.length === 0 ? (
                  <p className="pt-10 text-center text-sm text-faint">
                    {syncFailed ? "Can't reach the server — retrying…" : "No messages yet."}
                  </p>
                ) : (
                  <MessageList messages={messages} />
                )}
              </div>

              <Composer
                placeholder={"Message " + (conv?.kind === "channel" ? "#" : "") + title}
                onSend={send}
                disabled={pendingDm == null && conv?.id == null}
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Welcome</h2>
              <p className="mt-1.5 text-sm text-faint">
                Pick a conversation on the left, or open a tool.
              </p>

              <div className="mt-7 grid w-full max-w-md gap-2">
                {TOOL_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTool(key)}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-left transition hover:border-line-strong hover:bg-raised"
                  >
                    <span className="tool-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      {TOOL_META[key].icon}
                    </span>
                    <span className="text-[15px] font-medium text-ink">
                      {TOOL_META[key].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </main>

      {activeTool === null && conv?.kind === "group" && (
        <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-panel p-2.5 lg:flex">
          <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
            Members — {conv.members.length}
          </p>
          <div className="space-y-0.5 overflow-y-auto">
            {conv.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-raised"
              >
                <Avatar
                  name={member.displayName}
                  url={member.avatarUrl}
                  size={28}
                  active={activeUsers.some((user) => user.id === member.id)}
                  status={member.status}
                  ringColor="var(--color-panel)"
                />
                <span className="truncate text-[15px] text-ink">{member.displayName}</span>
              </div>
            ))}
          </div>
        </aside>
      )}

      {profileOpen && (
        <ProfileDialog
          me={currentUser}
          onClose={() => setProfileOpen(false)}
          onUpdated={(user) => setMe(user)}
        />
      )}

      {showGroupDialog && (
        <GroupDialog
          people={dms}
          onClose={() => setShowGroupDialog(false)}
          onCreate={createGroup}
          busy={groupBusy}
          error={groupError}
        />
      )}
    </div>
  );
}
