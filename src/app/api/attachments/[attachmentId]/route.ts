import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

// Only these types are safe to render inline; everything else downloads.
const INLINE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = Number((await params).attachmentId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }

  try {
    const attachment = await store.getAttachment(id);
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Files that live in object storage are handed straight to the browser, so
    // the CDN serves the bytes and this app stays out of the way.
    if (!attachment.data && attachment.remoteUrl) {
      const res = NextResponse.redirect(attachment.remoteUrl, 302);
      res.headers.set("Cache-Control", "private, max-age=300");
      return res;
    }

    if (!attachment.data) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const inline = INLINE_TYPES.includes(attachment.contentType.toLowerCase());
    const filename = attachment.filename.replace(/["\\\r\n]/g, "_");
    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": inline ? attachment.contentType : "application/octet-stream",
        "Content-Disposition":
          (inline ? "inline" : "attachment") + "; filename=\"" + filename + "\"",
        "Content-Length": String(attachment.data.length),
        "X-Content-Type-Options": "nosniff",
        // Rows are addressed by id, so this must stay revalidatable — a year of
        // `immutable` is what pinned stale pictures to recycled ids before.
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("attachment fetch failed", err);
    return NextResponse.json({ error: "Could not load that file" }, { status: 500 });
  }
}
