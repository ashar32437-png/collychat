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
import { isBanned } from "@/lib/types";
import type {
  Conversation,
  ConversationInfo,
  DmItem,
  GroupItem,
  Message,
  OutboxMessage,
  SyncResponse,
  User,
} from "@/lib/types";

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

/** The browser's own id for a message, so a resend cannot post it twice. */
function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

/** A message that is on its way, plus what we need to send it again. */
type OutboxEntry = OutboxMessage & {
  cacheKey: string;
  request: { attachmentId: number | null; gifUrl: string | null };
};

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
  /** set while an admin is previewing another account (read-only) */
  const [viewAs, setViewAs] = useState<User | null>(null);

  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [mountedTools, setMountedTools] = useState<ToolKey[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  const [conv, setConv] = useState<ConversationInfo | null>(null);
  const [pendingDm, setPendingDm] = useState<DmSidebarItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  /** sent but not yet stored — shown immediately so the box never waits */
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
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
  const viewAsRef = useRef<User | null>(null);
  /** what is on screen right now, readable without waiting for a render */
  const messagesRef = useRef<Message[]>([]);
  /**
   * Conversations already visited, so going back to one is instant instead of
   * another round trip. Keyed per account, because a preview must never show
   * the admin's own history — or the other way round.
   */
  const msgCacheRef = useRef(new Map<string, Message[]>());
  const convCacheRef = useRef(new Map<string, ConversationInfo>());
  const lastIdCacheRef = useRef(new Map<string, number>());

  const cacheKey = useCallback(
    (conversationId: number) => (viewAsRef.current?.id ?? 0) + ":" + conversationId,
    []
  );

  /** Single place that changes what the message pane shows, so the cache and
   *  the scroll cursor can never drift away from it. */
  const showMessages = useCallback(
    (conversationId: number, list: Message[]) => {
      messagesRef.current = list;
      setMessages(list);
      const key = cacheKey(conversationId);
      msgCacheRef.current.set(key, list);
      const last = list.length ? list[list.length - 1].id : 0;
      lastIdCacheRef.current.set(key, last);
      if (convKeyRef.current === "c:" + conversationId) lastIdRef.current = last;
    },
    [cacheKey]
  );

  /** Anything the server confirms by client id is no longer waiting. */
  const dropConfirmed = useCallback((incoming: Message[]) => {
    const confirmed = incoming
      .map((message) => message.clientId)
      .filter((id): id is string => Boolean(id));
    if (confirmed.length === 0) return;
    setOutbox((previous) => previous.filter((item) => !confirmed.includes(item.clientId)));
  }, []);

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
        body: JSON.stringify({
          conversationId,
          afterId,
          viewAsUserId: viewAsRef.current?.id ?? null,
        }),
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

    // The server decides whether the preview is still on — it may have been
    // dropped because the account vanished, or because we stopped being admin.
    if ((data.viewAs?.id ?? null) !== (viewAsRef.current?.id ?? null)) {
      viewAsRef.current = data.viewAs ?? null;
      setViewAs(data.viewAs ?? null);
      convKeyRef.current = "none";
      lastIdRef.current = 0;
      messagesRef.current = [];
      setMessages([]);
      setConv(null);
      setPendingDm(null);
      setLoadingMessages(false);
      // Re-run straight away, now against the corrected account.
      syncQueuedRef.current = true;
      return;
    }

    setDms(data.dms ?? []);
    setGroups(data.groups ?? []);
    setRooms(data.channels ?? []);
    setActiveUsers(data.active ?? []);
    if (data.me) setMe(data.me);
    if (data.conversation) {
      convCacheRef.current.set(cacheKey(data.conversation.id), data.conversation);
      setConv(data.conversation);
    }

    if (Array.isArray(data.messages) && conversationId != null) {
      dropConfirmed(data.messages);
      if (afterId === 0) {
        showMessages(conversationId, data.messages);
      } else if (data.messages.length > 0) {
        showMessages(conversationId, mergeMessages(messagesRef.current, data.messages));
      }
      setLoadingMessages(false);
    }
  }, [me?.approved, cacheKey, dropConfirmed, showMessages]);

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
  }, [messages, outbox]);

  // Keyed on id + approval so the sync itself refreshing `me` can't loop.
  const meKey = me ? me.id + ":" + (me.approved ? "1" : "0") : "";
  useEffect(() => {
    if (meKey.endsWith(":1")) void sync();
  }, [meKey, sync]);

  // ---------------------------------------------------------- sending
  /**
   * Hand a message to the outbox. The caller gets an answer straight away —
   * "queued" — because the bubble is already on screen and the network part
   * happens behind it. That is the whole point: typing the next message must
   * not wait on the last one.
   */
  const deliverMessage = useCallback(
    async (entry: OutboxEntry) => {
      const markFailed = () => {
        setOutbox((previous) =>
          previous.map((item) =>
            item.clientId === entry.clientId ? { ...item, failed: true } : item
          )
        );
      };
      try {
        const res = await fetch("/api/conversations/" + entry.conversationId + "/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: entry.body,
            attachmentId: entry.request.attachmentId,
            gifUrl: entry.request.gifUrl,
            clientId: entry.clientId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          markFailed();
          setError(typeof data?.error === "string" ? data.error : "Message failed to send");
          return;
        }
        const stored = data as Message;
        setOutbox((previous) => previous.filter((item) => item.clientId !== entry.clientId));
        // Fold the stored copy into its conversation even if we have since
        // wandered off to another one.
        const cached = msgCacheRef.current.get(entry.cacheKey) ?? [];
        const merged = mergeMessages(cached, [stored]);
        msgCacheRef.current.set(entry.cacheKey, merged);
        lastIdCacheRef.current.set(
          entry.cacheKey,
          Math.max(lastIdCacheRef.current.get(entry.cacheKey) ?? 0, stored.id)
        );
        if (convKeyRef.current === "c:" + entry.conversationId) {
          showMessages(entry.conversationId, merged);
          nearBottomRef.current = true;
        }
        setError(null);
      } catch {
        markFailed();
        setError("Message failed to send");
      }
    },
    [showMessages]
  );

  const queueMessage = useCallback(
    (conversationId: number, payload: ComposerPayload, author: User): void => {
      const entry: OutboxEntry = {
        id: 0,
        pending: true,
        clientId: newClientId(),
        conversationId,
        authorId: author.id,
        authorName: author.displayName,
        authorAvatarUrl: author.avatarUrl,
        body: payload.body,
        attachment: payload.attachment,
        createdAt: new Date().toISOString(),
        cacheKey: cacheKey(conversationId),
        request: { attachmentId: payload.attachmentId, gifUrl: payload.gifUrl },
      };
      setOutbox((previous) => [...previous, entry]);
      nearScrollToBottom();
      void deliverMessage(entry);
    },
    [cacheKey, deliverMessage]
  );

  function nearScrollToBottom() {
    nearBottomRef.current = true;
  }

  function retryMessage(clientId: string) {
    const entry = outbox.find((item) => item.clientId === clientId);
    if (!entry) return;
    setOutbox((previous) =>
      previous.map((item) => (item.clientId === clientId ? { ...item, failed: undefined } : item))
    );
    void deliverMessage(entry);
  }

  async function send(payload: ComposerPayload): Promise<boolean> {
    const current = me;
    if (!current?.approved) return false;
    if (viewAsRef.current) {
      setError("You're previewing " + viewAsRef.current.displayName + " — exit the preview to send.");
      return false;
    }

    const open =
      convKeyRef.current.startsWith("c:") ? Number(convKeyRef.current.slice(2)) : null;

    if (open != null) {
      queueMessage(open, payload, current);
      return true;
    }

    if (!pendingDm) return false;
    // A brand-new DM has to exist before anything can be shown in it, so this
    // one step is the only part of sending that still waits.
    try {
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
      const conversationId = data.id as number;
      convKeyRef.current = "c:" + conversationId;
      lastIdRef.current = 0;
      showMessages(conversationId, []);
      const info = toInfo(data);
      convCacheRef.current.set(cacheKey(conversationId), info);
      setConv(info);
      setPendingDm(null);
      setLoadingMessages(false);
      queueMessage(conversationId, payload, current);
      return true;
    } catch {
      setError("Could not open that DM");
      return false;
    }
  }

  // ----------------------------------------------------------- navigation
  /**
   * Opening a conversation shows whatever we already have for it immediately,
   * then quietly asks for anything newer. Waiting on a round trip before
   * drawing anything is what made flicking between rooms and DMs feel slow.
   */
  const loadConversation = useCallback(
    async (conversationId: number, afterId: number, key: string) => {
      try {
        const params = new URLSearchParams({ after: String(afterId) });
        const previewId = viewAsRef.current?.id;
        if (previewId) params.set("viewAs", String(previewId));
        const res = await fetch(
          "/api/conversations/" + conversationId + "/messages?" + params.toString(),
          { cache: "no-store", signal: AbortSignal.timeout(15000) }
        );
        if (res.status === 401) {
          setMe(null);
          return;
        }
        if (!res.ok) return; // the poll reports trouble; this is only a shortcut
        const data = (await res.json()) as {
          conversation?: ConversationInfo | null;
          messages?: Message[] | null;
        };
        if (convKeyRef.current !== "c:" + conversationId) return;
        if (data.conversation) {
          convCacheRef.current.set(key, data.conversation);
          setConv(data.conversation);
        }
        const incoming = Array.isArray(data.messages) ? data.messages : [];
        dropConfirmed(incoming);
        showMessages(
          conversationId,
          afterId === 0 ? incoming : mergeMessages(messagesRef.current, incoming)
        );
        setLoadingMessages(false);
      } catch {
        /* the poll will report trouble */
      }
    },
    [dropConfirmed, showMessages]
  );

  function openConversation(conversationId: number, info?: ConversationInfo | null) {
    setActiveTool(null);
    convKeyRef.current = "c:" + conversationId;
    setPendingDm(null);
    nearBottomRef.current = true;

    const key = cacheKey(conversationId);
    const cachedInfo = convCacheRef.current.get(key) ?? null;
    const cached = msgCacheRef.current.get(key) ?? null;
    const cachedLast = lastIdCacheRef.current.get(key) ?? 0;

    setConv(info ?? cachedInfo ?? null);
    if (cached) {
      showMessages(conversationId, cached);
      setLoadingMessages(false);
    } else {
      messagesRef.current = [];
      setMessages([]);
      lastIdRef.current = 0;
      setLoadingMessages(true);
    }
    void loadConversation(conversationId, cached ? cachedLast : 0, key);
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
      // We already know this DM's id and who it is with, so the chat can open
      // on the spot rather than flashing the welcome screen first.
      openConversation(item.id, toInfo({ id: item.id, kind: "dm", name: item.name, slug: null }));
      return;
    }
    convKeyRef.current = "none";
    lastIdRef.current = 0;
    messagesRef.current = [];
    setMessages([]);
    setConv(null);
    setPendingDm(item);
    setLoadingMessages(false);
    void sync();
  }

  /** Enter or leave an admin's read-only preview of another account. */
  const applyViewAs = useCallback(
    (target: User | null) => {
      viewAsRef.current = target;
      setViewAs(target);
      convKeyRef.current = "none";
      lastIdRef.current = 0;
      messagesRef.current = [];
      setMessages([]);
      setConv(null);
      setPendingDm(null);
      setLoadingMessages(false);
      void sync();
    },
    [sync]
  );

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    viewAsRef.current = null;
    setViewAs(null);
    convKeyRef.current = "none";
    messagesRef.current = [];
    setMessages([]);
    setOutbox([]);
    msgCacheRef.current.clear();
    convCacheRef.current.clear();
    lastIdCacheRef.current.clear();
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

  if (isBanned(me)) {
    return (
      <div className="flex h-screen items-center justify-center bg-base px-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold text-ink">Account suspended</h1>
          <p className="mt-2 text-sm leading-relaxed text-faint">
            An admin suspended this account until{" "}
            <span className="text-warn">{new Date(me.bannedUntil as string).toLocaleString()}</span>.
            Your messages stay where they are.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-5 rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:bg-raised hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    );
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
  const queued =
    activeConversationId == null
      ? []
      : outbox.filter((item) => item.conversationId === activeConversationId);

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
        onOpenRoom={(conversationId) => {
          const room = rooms.find((item) => item.id === conversationId);
          openConversation(
            conversationId,
            room ? toInfo({ ...room, members: [] }) : null
          );
        }}
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
        {viewAs && (
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 text-xs text-warn">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            <span className="min-w-0 flex-1 truncate">
              Viewing as <span className="font-semibold">{viewAs.displayName}</span> — read-only.
              Their groups and DMs are exactly as they see them.
            </span>
            <button
              type="button"
              onClick={() => applyViewAs(null)}
              className="shrink-0 rounded-md border border-warn/40 px-2.5 py-1 font-medium transition hover:bg-warn/15"
            >
              Exit preview
            </button>
          </div>
        )}

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
              {key === "admin" && currentUser.isAdmin && (
                <AdminTool me={currentUser} onPreviewUser={applyViewAs} />
              )}
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
                    messagesRef.current = [];
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
                ) : messages.length === 0 && queued.length === 0 ? (
                  <p className="pt-10 text-center text-sm text-faint">
                    {syncFailed ? "Can't reach the server — retrying…" : "No messages yet."}
                  </p>
                ) : (
                  <MessageList
                    messages={[...messages, ...(viewAs ? [] : queued)]}
                    onRetry={retryMessage}
                  />
                )}
              </div>

              <Composer
                placeholder={
                  viewAs
                    ? "Read-only preview — exit to send messages"
                    : "Message " + (conv?.kind === "channel" ? "#" : "") + title
                }
                onSend={send}
                disabled={viewAs != null || (pendingDm == null && conv?.id == null)}
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
