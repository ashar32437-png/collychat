import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { signInRequired } from "@/lib/guard";
import { store } from "@/lib/store";
import { ACTIVE_WINDOW_MS } from "@/lib/types";
import type { ConversationInfo, DmItem, GroupItem, SyncResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// One request per tick keeps the client simple: heartbeat + presence +
// the sidebar (DMs and group chats) + new messages for the open conversation.
export async function POST(req: Request) {
  const me = await currentUser();
  const blocked = signInRequired(me);
  if (blocked) return blocked;
  const user = me as NonNullable<typeof me>;

  const body = await req.json().catch(() => null);
  const rawAfter = Number(body?.afterId);
  const rawConversation = Number(body?.conversationId);
  const afterId = Number.isFinite(rawAfter) && rawAfter > 0 ? rawAfter : 0;
  const conversationId =
    Number.isFinite(rawConversation) && rawConversation > 0 ? rawConversation : null;

  try {
    await store.touchPresence(user.id);

    const sinceIso = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
    const [active, myDms, myGroups, channels] = await Promise.all([
      store.listActiveUsers(sinceIso, user.id),
      store.listMyConversations(user.id, "dm"),
      store.listMyConversations(user.id, "group"),
      store.listChannels(),
    ]);

    const activeIds = new Set(active.map((user) => user.id));
    const lastTimes = await store.lastMessageTimes([
      ...myDms.map((item) => item.id),
      ...myGroups.map((item) => item.id),
    ]);

    // DM list = people you already have a DM with, plus everyone active now.
    const dms: DmItem[] = [];
    for (const conversation of myDms) {
      const members = await store.listMembers(conversation.id);
      const partner = members.find((member) => member.id !== user.id);
      if (!partner) continue;
      dms.push({
        userId: partner.id,
        displayName: partner.displayName,
        avatarUrl: partner.avatarUrl,
        status: partner.status,
        active: activeIds.has(partner.id),
        conversationId: conversation.id,
        lastMessageAt: lastTimes.get(conversation.id) ?? null,
      });
    }
    for (const person of active) {
      if (dms.some((item) => item.userId === person.id)) continue;
      dms.push({
        userId: person.id,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        status: person.status,
        active: true,
        conversationId: null,
        lastMessageAt: null,
      });
    }
    dms.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      const at = a.lastMessageAt ?? "";
      const bt = b.lastMessageAt ?? "";
      if (at !== bt) return at < bt ? 1 : -1;
      return a.displayName.localeCompare(b.displayName);
    });

    const groups: GroupItem[] = [];
    for (const conversation of myGroups) {
      const members = await store.listMembers(conversation.id);
      groups.push({
        id: conversation.id,
        name: conversation.name,
        lastMessageAt: lastTimes.get(conversation.id) ?? null,
        memberCount: members.length,
      });
    }

    let conversation: ConversationInfo | null = null;
    let messages = null;
    if (conversationId != null) {
      const found = await store.getConversation(conversationId);
      const allowed =
        found && (found.kind === "channel" || (await store.isMember(conversationId, user.id)));
      if (!found || !allowed) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      conversation = {
        ...found,
        members: found.kind === "channel" ? [] : await store.listMembers(conversationId),
      };
      messages = await store.listMessages(conversationId, afterId, afterId > 0 ? 200 : 60);
    }

    const payload: SyncResponse = {
      me: user,
      active,
      dms,
      groups,
      channels,
      conversation,
      messages,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
