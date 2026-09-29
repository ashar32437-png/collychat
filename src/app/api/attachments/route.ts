import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { signInRequired } from "@/lib/guard";
import { MAX_ATTACHMENT_BYTES } from "@/lib/types";
import { acceptUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";
// 5 MB of upload plus multipart overhead.
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await currentUser();
  const blocked = signInRequired(me);
  if (blocked) return blocked;
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received" }, { status: 400 });
    }

    const result = await acceptUpload({
      uploaderId: me.id,
      file,
      limitBytes: MAX_ATTACHMENT_BYTES,
      folder: "images",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.attachment, { status: 201 });
  } catch (err) {
    console.error("upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
