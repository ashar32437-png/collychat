import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { MAX_AVATAR_BYTES, isImageType } from "@/lib/types";
import { acceptUpload, discardStoredFile, megabytes } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image received" }, { status: 400 });
    }
    if (!isImageType(file.type)) {
      return NextResponse.json({ error: "Pick a PNG, JPG, GIF, WebP or AVIF" }, { status: 415 });
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "Profile pictures must be under " + megabytes(MAX_AVATAR_BYTES) + " MB" },
        { status: 413 }
      );
    }

    const previous = me.avatarUrl?.startsWith("/api/attachments/")
      ? Number(me.avatarUrl.split("/").pop())
      : null;
    const previousRow = previous && Number.isInteger(previous)
      ? await store.getAttachment(previous)
      : null;

    const result = await acceptUpload({
      uploaderId: me.id,
      file,
      limitBytes: MAX_AVATAR_BYTES,
      folder: "avatars",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const user = await store.updateUser(me.id, { avatarAttachmentId: result.attachment.id });
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    // The old picture is nobody's avatar any more — drop it so it does not sit
    // in storage for the next five months.
    if (previousRow && previous != null) {
      await discardStoredFile(previousRow.remoteUrl);
      await store.deleteAttachment(previous);
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("avatar upload failed", err);
    return NextResponse.json({ error: "Could not save that picture" }, { status: 500 });
  }
}
