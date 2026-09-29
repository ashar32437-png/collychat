import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { signInRequired } from "@/lib/guard";
import { store } from "@/lib/store";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";

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

  if (!text && attachmentId == null && !gifUrl) {
    return NextResponse.json({ error: "Nothing to send" }, { status: 400 });
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

    const message = await store.createMessage(conversationId, me.id, text, attachmentId);
    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    console.error("send message failed", err);
    return NextResponse.json({ error: "Could not send that message" }, { status: 500 });
  }
}
