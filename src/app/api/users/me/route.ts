import { NextResponse } from "next/server";
import { currentUser, normalizeDisplayName, validateDisplayName } from "@/lib/auth";
import { store } from "@/lib/store";
import type { ProfilePatch } from "@/lib/types";

export const dynamic = "force-dynamic";

// Display name and presence status. Avatars go through /api/users/me/avatar.
export async function PATCH(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: ProfilePatch = {};

  if (typeof body?.displayName === "string") {
    const displayName = normalizeDisplayName(body.displayName);
    const error = validateDisplayName(displayName);
    if (error) return NextResponse.json({ error }, { status: 400 });
    patch.displayName = displayName;
  }

  if (typeof body?.status === "string") {
    if (body.status !== "active" && body.status !== "dnd") {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  try {
    const user = await store.updateUser(me.id, patch);
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("profile update failed", err);
    return NextResponse.json({ error: "Could not save your profile" }, { status: 500 });
  }
}
