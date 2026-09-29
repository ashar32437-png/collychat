import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { signInRequired } from "@/lib/guard";
import { store } from "@/lib/store";
import { MAX_MESSAGE_LENGTH, isMuted } from "@/lib/types";
import type { ConversationInfo, Message } from "@/lib/types";

export const dynamic = "force-dynamic";

// GIFs are stored as nothing but their URL, so the picker can only hand us
// addresses on GIPHY's own media hosts.
const GIF_HOSTS = [
  "giphy.com",
  "media.giphy.com",
  "media0.giphy.com",
  "media1.giphy.com",
  "media2.giphy.com",
  "media3.giphy.com",
  "media4.giphy.com",
  "i.giphy.com",
];

function safeGifUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    return GIF_HOSTS.some((allowed) => host === allowed || host.endsWith("." + allowed))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

// Just the conversation and its messages — no sidebar, no presence. Opening a
// chat used to mean waiting for a whole sync round trip; this is a couple of
// queries so switching between rooms and DMs feels immediate.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const me = await currentUser();
  const blocked = signInRequired(me);
  if (blocked) return blocked;
  const viewer = me as NonNullable<typeof me>;

  const conversationId = Number((await params).conversationId);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  }

  const search = new URL(req.url).searchParams;
  const after = Number(search.get("after"));
  const afterId = Number.isFinite(after) && after > 0 ? after : 0;

  // Admins previewing an account read that account's conversations.
  const rawViewAs = Number(search.get("viewAs"));
  let subject = viewer;
  if (
    viewer.isAdmin &&
    Number.isInteger(rawViewAs) &&
    rawViewAs > 0 &&
    rawViewAs !== viewer.id
  ) {
    const target = await store.getUser(rawViewAs);
    if (target) subject = target;
  }

  try {
    const found = await store.getConversation(conversationId);
    if (!found) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (found.kind !== "channel" && !(await store.isMember(conversationId, subject.id))) {
      return NextResponse.json({ error: "You're not in this conversation" }, { status: 403 });
    }

    const conversation: ConversationInfo = {
      ...found,
      members: found.kind === "channel" ? [] : await store.listMembers(conversationId),
    };
    const messages = await store.listMessages(conversationId, afterId, afterId > 0 ? 200 : 60);
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    console.error("load conversation failed", err);
    return NextResponse.json({ error: "Could not load that conversation" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const me = await currentUser();
  const blocked = signInRequired(me);
  if (blocked) return blocked;
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const conversationId = Number((await params).conversationId);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  const rawAttachment = Number(body?.attachmentId);
  let attachmentId = Number.isInteger(rawAttachment) && rawAttachment > 0 ? rawAttachment : null;
  const gifUrl = typeof body?.gifUrl === "string" ? safeGifUrl(body.gifUrl) : null;
  // The browser tags each message it sends so a retry cannot double-post it.
  const rawClientId = typeof body?.clientId === "string" ? body.clientId : "";
  const clientId = /^[A-Za-z0-9_-]{8,64}$/.test(rawClientId) ? rawClientId : null;

  if (!text && attachmentId == null && !gifUrl) {
    return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
  }

  if (isMuted(me)) {
    return NextResponse.json(
      {
        error: "You're muted until " + new Date(me.mutedUntil as string).toLocaleString(),
        mutedUntil: me.mutedUntil,
      },
      { status: 403 }
    );
  }

  try {
    const conversation = await store.getConversation(conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (conversation.kind !== "channel" && !(await store.isMember(conversationId, me.id))) {
      return NextResponse.json({ error: "You're not in this conversation" }, { status: 403 });
    }

    if (gifUrl) {
      const gif = await store.createAttachment(me.id, "giphy.gif", "image/gif", 0, null, gifUrl);
      attachmentId = gif.id;
    }

    const message: Message = await store.createMessage(
      conversationId,
      me.id,
      text,
      attachmentId,
      clientId
    );
    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    console.error("send message failed", err);
    return NextResponse.json({ error: "Could not send that message" }, { status: 500 });
  }
}
